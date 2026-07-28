const express = require('express');
const webpush = require('web-push');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authenticate } = require('./middleware');

const router = express.Router();

// In-memory: one active rest timer per user (cleared on fire or cancel)
const activeTimers = new Map();

function initVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  }
}

// Frontend fetches this to subscribe without needing a build-time env var
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
});

// Save or update push subscription for the logged-in user
router.post('/subscribe', authenticate, async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription) return res.status(400).json({ error: 'subscription required' });
    const db = getDb();
    await db.prepare(`
      INSERT INTO push_subscriptions (id, user_id, subscription_json)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET subscription_json = EXCLUDED.subscription_json
    `).run([uuidv4(), req.userId, JSON.stringify(subscription)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Remove push subscription (user opted out)
router.delete('/subscribe', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run([req.userId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Start a rest timer — fires a push notification after `seconds` seconds
router.post('/rest-timer', authenticate, async (req, res, next) => {
  try {
    const { seconds, exerciseName } = req.body;
    if (!seconds || seconds < 1) return res.status(400).json({ error: 'seconds required' });
    const userId = req.userId;

    // Cancel any existing timer for this user
    if (activeTimers.has(userId)) clearTimeout(activeTimers.get(userId));

    const db = getDb();
    const sub = await db.prepare('SELECT subscription_json FROM push_subscriptions WHERE user_id = ?').get([userId]);
    if (!sub) return res.json({ ok: true, push: false });

    initVapid();
    const handle = setTimeout(async () => {
      activeTimers.delete(userId);
      try {
        await webpush.sendNotification(
          JSON.parse(sub.subscription_json),
          JSON.stringify({
            title: 'Rest complete — time to go',
            body: exerciseName ? `Back to ${exerciseName}.` : 'Get back under the bar.',
            url: '/workout',
          })
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          const db2 = getDb();
          await db2.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run([userId]);
        }
      }
    }, seconds * 1000);

    activeTimers.set(userId, handle);
    res.json({ ok: true, push: true });
  } catch (err) { next(err); }
});

// Send yourself a test push — lets you verify the full stack without waiting for cron
router.post('/test', authenticate, async (req, res, next) => {
  try {
    const db = getDb();
    const sub = await db.prepare('SELECT subscription_json FROM push_subscriptions WHERE user_id = ?').get([req.userId]);
    if (!sub) return res.status(404).json({ error: 'No push subscription found. Open the app in your PWA (home screen) to register.' });
    initVapid();
    await webpush.sendNotification(
      JSON.parse(sub.subscription_json),
      JSON.stringify({ title: 'FitnessAI — push works!', body: 'Notifications are set up correctly.', url: '/' })
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      const db = getDb();
      await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run([req.userId]);
      return res.status(410).json({ error: 'Subscription expired — re-open PWA to re-register.' });
    }
    next(err);
  }
});

// Cancel an active rest timer
router.delete('/rest-timer', authenticate, (req, res) => {
  const userId = req.userId;
  if (activeTimers.has(userId)) {
    clearTimeout(activeTimers.get(userId));
    activeTimers.delete(userId);
  }
  res.json({ ok: true });
});

// Called by external cron (cron-job.org) once a day — sends reminders to users
// who haven't logged their weight in more than 3 days.
router.post('/check', async (req, res, next) => {
  try {
    const secret = req.headers['x-cron-secret'];
    if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });

    const db = getDb();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Find all users with a push subscription whose last weight log is > 3 days ago (or never)
    const subs = await db.prepare(`
      SELECT ps.user_id, ps.subscription_json
      FROM push_subscriptions ps
      WHERE NOT EXISTS (
        SELECT 1 FROM weight_logs wl
        WHERE wl.user_id = ps.user_id AND wl.logged_at > ?
      )
    `).all([threeDaysAgo]);

    initVapid();
    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          JSON.parse(sub.subscription_json),
          JSON.stringify({
            title: 'FitnessAI — Log your weight',
            body: "It's been a few days. Jump on the scale and let coach know.",
            url: '/',
          })
        );
        sent++;
      } catch (err) {
        // Subscription expired or invalid — remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run([sub.user_id]);
        }
      }
    }

    res.json({ checked: subs.length, sent });
  } catch (err) { next(err); }
});

module.exports = router;
