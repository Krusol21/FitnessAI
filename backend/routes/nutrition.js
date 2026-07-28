const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { authenticate } = require('./middleware');

const router = express.Router();
router.use(authenticate);

router.get('/foods', async (req, res, next) => {
  try {
    const { q } = req.query;
    const db = getDb();
    let foods;
    if (q) {
      foods = await db.prepare(
        "SELECT * FROM foods WHERE user_id = ? AND name ILIKE ? ORDER BY name ASC LIMIT 20"
      ).all([req.userId, `%${q}%`]);
    } else {
      foods = await db.prepare(
        'SELECT * FROM foods WHERE user_id = ? ORDER BY name ASC'
      ).all([req.userId]);
    }
    res.json(foods);
  } catch (err) { next(err); }
});

router.post('/foods', async (req, res, next) => {
  try {
    const { name, calories, protein_g, carbs_g, fat_g, sugar_g, serving_size, serving_unit } = req.body;
    if (!name || calories === undefined) return res.status(400).json({ error: 'name and calories required' });
    const db = getDb();
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO foods (id, user_id, name, calories, protein_g, carbs_g, fat_g, sugar_g, serving_size, serving_unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, name) DO UPDATE SET
        calories = EXCLUDED.calories,
        protein_g = EXCLUDED.protein_g,
        carbs_g = EXCLUDED.carbs_g,
        fat_g = EXCLUDED.fat_g,
        sugar_g = EXCLUDED.sugar_g,
        serving_size = EXCLUDED.serving_size,
        serving_unit = EXCLUDED.serving_unit
    `).run([
      id, req.userId, name, calories,
      protein_g || 0, carbs_g || 0, fat_g || 0, sugar_g || 0,
      serving_size || 1, serving_unit || 'serving'
    ]);
    const food = await db.prepare('SELECT * FROM foods WHERE user_id = ? AND name = ?').get([req.userId, name]);
    res.status(201).json(food);
  } catch (err) { next(err); }
});

router.delete('/foods/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.prepare('DELETE FROM foods WHERE id = ? AND user_id = ?').run([req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/logs', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const db = getDb();
    let logs;
    if (start && end) {
      logs = await db.prepare(`
        SELECT nl.*, f.name, f.calories, f.protein_g, f.carbs_g, f.fat_g, f.sugar_g, f.serving_size, f.serving_unit
        FROM nutrition_logs nl
        JOIN foods f ON f.id = nl.food_id
        WHERE nl.user_id = ? AND nl.logged_at >= ?::timestamptz AND nl.logged_at < ?::timestamptz
        ORDER BY nl.logged_at ASC
      `).all([req.userId, start, end]);
    } else {
      logs = await db.prepare(`
        SELECT nl.*, f.name, f.calories, f.protein_g, f.carbs_g, f.fat_g, f.sugar_g, f.serving_size, f.serving_unit
        FROM nutrition_logs nl
        JOIN foods f ON f.id = nl.food_id
        WHERE nl.user_id = ?
        ORDER BY nl.logged_at DESC
        LIMIT 100
      `).all([req.userId]);
    }
    res.json(logs);
  } catch (err) { next(err); }
});

router.post('/logs', async (req, res, next) => {
  try {
    const { food_id, servings, logged_at } = req.body;
    if (!food_id) return res.status(400).json({ error: 'food_id required' });
    const db = getDb();
    const id = uuidv4();
    await db.prepare(
      'INSERT INTO nutrition_logs (id, user_id, food_id, servings, logged_at) VALUES (?, ?, ?, ?, ?)'
    ).run([id, req.userId, food_id, servings || 1, logged_at || new Date().toISOString()]);
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

router.delete('/logs/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.prepare('DELETE FROM nutrition_logs WHERE id = ? AND user_id = ?').run([req.params.id, req.userId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get('/summary', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const db = getDb();
    // start/end are UTC ISO strings representing local-day boundaries sent from the frontend
    const totals = await db.prepare(`
      SELECT
        COUNT(*) as entries,
        ROUND(SUM(nl.servings * f.calories)::numeric, 1) as total_calories,
        ROUND(SUM(nl.servings * f.protein_g)::numeric, 1) as total_protein_g,
        ROUND(SUM(nl.servings * f.carbs_g)::numeric, 1) as total_carbs_g,
        ROUND(SUM(nl.servings * f.fat_g)::numeric, 1) as total_fat_g,
        ROUND(SUM(nl.servings * f.sugar_g)::numeric, 1) as total_sugar_g
      FROM nutrition_logs nl
      JOIN foods f ON f.id = nl.food_id
      WHERE nl.user_id = ? AND nl.logged_at >= ?::timestamptz AND nl.logged_at < ?::timestamptz
    `).get([req.userId, start || new Date(new Date().setHours(0,0,0,0)).toISOString(), end || new Date(new Date().setHours(24,0,0,0)).toISOString()]);
    res.json({ ...totals });
  } catch (err) { next(err); }
});

const DEFAULT_TARGETS = { calories: 2500, protein_g: 180, carbs_g: 250, fat_g: 80, sugar_g: 50 };

router.get('/targets', async (req, res, next) => {
  try {
    const db = getDb();
    const row = await db.prepare('SELECT nutrition_targets FROM users WHERE id = ?').get([req.userId]);
    const stored = row?.nutrition_targets;
    res.json(stored ? { ...DEFAULT_TARGETS, ...stored } : DEFAULT_TARGETS);
  } catch (err) { next(err); }
});

router.patch('/targets', async (req, res, next) => {
  try {
    const allowed = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'sugar_g'];
    const update = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
    if (!Object.keys(update).length) return res.status(400).json({ error: 'No valid targets provided' });
    const db = getDb();
    // Merge with existing targets
    const row = await db.prepare('SELECT nutrition_targets FROM users WHERE id = ?').get([req.userId]);
    const merged = { ...(row?.nutrition_targets || {}), ...update };
    await db.prepare('UPDATE users SET nutrition_targets = ?::jsonb WHERE id = ?').run([JSON.stringify(merged), req.userId]);
    res.json({ ok: true, targets: { ...DEFAULT_TARGETS, ...merged } });
  } catch (err) { next(err); }
});

module.exports = router;
