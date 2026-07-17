const express = require('express');
const webpush = require('web-push');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authenticate } = require('./middleware');

const router = express.Router();

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

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
