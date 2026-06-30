const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authenticate } = require('./middleware');

const router = express.Router();
router.use(authenticate);

router.get('/plan', async (req, res, next) => {
  try {
    const db = getDb();
    const plan = await db.prepare(
      'SELECT * FROM workout_plans WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1'
    ).get([req.userId]);

    if (!plan) return res.json(null);

    let cycleWeek = null, phase = 'build';
    if (plan.cycle_start_date) {
      const days = Math.floor((Date.now() - new Date(plan.cycle_start_date)) / 86400000);
      const weekNum = (Math.floor(days / 7) % 14) + 1;
      cycleWeek = weekNum;
      phase = weekNum === 7 ? 'deload' : weekNum === 14 ? 'off' : 'build';
    }

    res.json({ ...plan, plan_json: JSON.parse(plan.plan_json), cycle_week: cycleWeek, phase });
  } catch (err) { next(err); }
});

router.get('/plans', async (req, res, next) => {
  try {
    const db = getDb();
    const plans = await db.prepare(
      'SELECT id, name, is_active, cycle_start_date, created_at FROM workout_plans WHERE user_id = ? ORDER BY created_at DESC'
    ).all([req.userId]);
    res.json(plans);
  } catch (err) { next(err); }
});

router.post('/plan', async (req, res, next) => {
  try {
    const { name, plan_json, cycle_start_date } = req.body;
    if (!name || !plan_json) return res.status(400).json({ error: 'name and plan_json required' });
    const db = getDb();
    await db.prepare('UPDATE workout_plans SET is_active = 0 WHERE user_id = ?').run([req.userId]);
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO workout_plans (id, user_id, name, plan_json, is_active, cycle_start_date)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run([id, req.userId, name, JSON.stringify(plan_json), cycle_start_date || new Date().toISOString().split('T')[0]]);
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.patch('/plan/:id/activate', async (req, res, next) => {
  try {
    const db = getDb();
    await db.prepare('UPDATE workout_plans SET is_active = 0 WHERE user_id = ?').run([req.userId]);
    await db.prepare('UPDATE workout_plans SET is_active = 1, cycle_start_date = ? WHERE id = ? AND user_id = ?')
      .run([new Date().toISOString().split('T')[0], req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/logs', async (req, res, next) => {
  try {
    const { date } = req.query;
    const db = getDb();
    let logs;
    if (date) {
      logs = await db.prepare(
        'SELECT * FROM workout_logs WHERE user_id = ? AND logged_at::date = ?::date ORDER BY logged_at ASC'
      ).all([req.userId, date]);
    } else {
      logs = await db.prepare(
        'SELECT * FROM workout_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 100'
      ).all([req.userId]);
    }
    res.json(logs);
  } catch (err) { next(err); }
});

router.post('/logs', async (req, res, next) => {
  try {
    const { plan_id, cycle_week, day_type, exercise_name, sets_completed, logged_at } = req.body;
    if (!day_type || !exercise_name || cycle_week === undefined) {
      return res.status(400).json({ error: 'day_type, exercise_name, cycle_week required' });
    }
    const db = getDb();
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO workout_logs (id, user_id, plan_id, cycle_week, day_type, exercise_name, sets_completed, logged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run([id, req.userId, plan_id || null, cycle_week, day_type, exercise_name,
      sets_completed || 0, logged_at || new Date().toISOString()]);
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.patch('/logs/:id', async (req, res, next) => {
  try {
    const { sets_completed } = req.body;
    const db = getDb();
    await db.prepare('UPDATE workout_logs SET sets_completed = ? WHERE id = ? AND user_id = ?')
      .run([sets_completed, req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
