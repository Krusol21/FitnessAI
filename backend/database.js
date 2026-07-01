require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Wrapper that matches the sql.js API used throughout routes
const dbWrapper = {
  prepare(sql) {
    // Convert ? placeholders to $1, $2, ... for PostgreSQL
    let i = 0;
    const pgSql = sql.replace(/\?/g, () => `$${++i}`);
    return {
      async all(params = []) {
        const { rows } = await pool.query(pgSql, params);
        return rows;
      },
      async get(params = []) {
        const { rows } = await pool.query(pgSql, params);
        return rows[0] || undefined;
      },
      async run(params = []) {
        const result = await pool.query(pgSql, params);
        return { changes: result.rowCount };
      },
    };
  },
};

function getDb() {
  return dbWrapper;
}

async function initDb() {
  await migrate();
  console.log('[db] PostgreSQL ready');
}

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT 'maintain',
      target_weight_lbs REAL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS weight_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weight_lbs REAL NOT NULL,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS foods (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      calories REAL NOT NULL,
      protein_g REAL NOT NULL DEFAULT 0,
      carbs_g REAL NOT NULL DEFAULT 0,
      fat_g REAL NOT NULL DEFAULT 0,
      sugar_g REAL NOT NULL DEFAULT 0,
      serving_size REAL NOT NULL DEFAULT 1,
      serving_unit TEXT NOT NULL DEFAULT 'serving',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS nutrition_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
      servings REAL NOT NULL DEFAULT 1,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pr_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exercise_name TEXT NOT NULL,
      weight_lbs REAL NOT NULL,
      reps INTEGER NOT NULL,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workout_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      cycle_start_date TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT REFERENCES workout_plans(id) ON DELETE SET NULL,
      cycle_week INTEGER NOT NULL,
      day_type TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      sets_completed INTEGER NOT NULL DEFAULT 0,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE foods ADD COLUMN IF NOT EXISTS sugar_g REAL NOT NULL DEFAULT 0;

    CREATE INDEX IF NOT EXISTS idx_weight_logs_user ON weight_logs(user_id, logged_at);
    CREATE INDEX IF NOT EXISTS idx_nutrition_logs_user ON nutrition_logs(user_id, logged_at);
    CREATE INDEX IF NOT EXISTS idx_pr_logs_user ON pr_logs(user_id, exercise_name);
    CREATE INDEX IF NOT EXISTS idx_workout_logs_user ON workout_logs(user_id, logged_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_foods_user ON foods(user_id, name);
  `);
}

module.exports = { getDb, initDb, pool };
