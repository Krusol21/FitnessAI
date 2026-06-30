const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authenticate } = require('./middleware');

const router = express.Router();
router.use(authenticate);

router.get('/weight', async (req, res, next) => {
  try {
    const db = getDb();
    const logs = await db.prepare(
      'SELECT * FROM weight_logs WHERE user_id = ? ORDER BY logged_at ASC'
    ).all([req.userId]);
    res.json(logs);
  } catch (err) { next(err); }
});

router.post('/weight', async (req, res, next) => {
  try {
    const { weight_lbs, logged_at } = req.body;
    if (!weight_lbs) return res.status(400).json({ error: 'weight_lbs required' });
    const db = getDb();
    const id = uuidv4();
    await db.prepare(
      'INSERT INTO weight_logs (id, user_id, weight_lbs, logged_at) VALUES (?, ?, ?, ?)'
    ).run([id, req.userId, weight_lbs, logged_at || new Date().toISOString()]);
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.get('/prs', async (req, res, next) => {
  try {
    const db = getDb();
    const prs = await db.prepare(`
      SELECT exercise_name, MAX(weight_lbs) as best_weight_lbs, reps, MAX(logged_at) as logged_at
      FROM pr_logs WHERE user_id = ?
      GROUP BY exercise_name, reps
      ORDER BY exercise_name ASC
    `).all([req.userId]);
    res.json(prs);
  } catch (err) { next(err); }
});

router.get('/prs/history/:exercise', async (req, res, next) => {
  try {
    const db = getDb();
    const logs = await db.prepare(
      'SELECT * FROM pr_logs WHERE user_id = ? AND exercise_name = ? ORDER BY logged_at ASC'
    ).all([req.userId, req.params.exercise]);
    res.json(logs);
  } catch (err) { next(err); }
});

router.post('/prs', async (req, res, next) => {
  try {
    const { exercise_name, weight_lbs, reps, logged_at } = req.body;
    if (!exercise_name || !weight_lbs || !reps) {
      return res.status(400).json({ error: 'exercise_name, weight_lbs, and reps required' });
    }
    const db = getDb();
    const id = uuidv4();
    await db.prepare(
      'INSERT INTO pr_logs (id, user_id, exercise_name, weight_lbs, reps, logged_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run([id, req.userId, exercise_name, weight_lbs, reps, logged_at || new Date().toISOString()]);
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.get('/profile', async (req, res, next) => {
  try {
    const db = getDb();
    const user = await db.prepare(
      'SELECT email, goal, target_weight_lbs, created_at FROM users WHERE id = ?'
    ).get([req.userId]);
    res.json(user);
  } catch (err) { next(err); }
});

router.patch('/profile', async (req, res, next) => {
  try {
    const { goal, target_weight_lbs } = req.body;
    const db = getDb();
    if (goal) await db.prepare('UPDATE users SET goal = ? WHERE id = ?').run([goal, req.userId]);
    if (target_weight_lbs !== undefined)
      await db.prepare('UPDATE users SET target_weight_lbs = ? WHERE id = ?').run([target_weight_lbs, req.userId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
