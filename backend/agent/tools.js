const { getDb } = require('../database');
const { v4: uuidv4 } = require('uuid');

const TOOL_DEFINITIONS = [
  {
    name: 'get_user_profile',
    description: 'Get the user\'s profile including goal, target weight, latest weight, and current cycle info.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'log_weight',
    description: 'Log the user\'s body weight.',
    input_schema: {
      type: 'object',
      properties: {
        weight_lbs: { type: 'number', description: 'Body weight in pounds' },
        logged_at: { type: 'string', description: 'ISO date string (optional, defaults to now)' },
      },
      required: ['weight_lbs'],
    },
  },
  {
    name: 'get_prs',
    description: 'Get the user\'s current personal records (best sets) per exercise.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'update_pr',
    description: 'Log a new personal record for an exercise.',
    input_schema: {
      type: 'object',
      properties: {
        exercise_name: { type: 'string', description: 'Name of the exercise (e.g. "Back Squat", "Bench Press")' },
        weight_lbs: { type: 'number', description: 'Weight lifted in pounds' },
        reps: { type: 'integer', description: 'Number of reps completed at that weight' },
      },
      required: ['exercise_name', 'weight_lbs', 'reps'],
    },
  },
  {
    name: 'log_food',
    description: 'Log a food item the user ate. Saves the food to their library if new, then records the log entry.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        calories: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        sugar_g: { type: 'number' },
        serving_size: { type: 'number' },
        serving_unit: { type: 'string' },
        servings: { type: 'number', description: 'Number of servings consumed (default 1)' },
      },
      required: ['name', 'calories'],
    },
  },
  {
    name: 'search_food_library',
    description: 'Search the user\'s food library by name to find previously saved foods.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'get_nutrition_summary',
    description: "Get today's macro totals (calories, protein, carbs, fat, sugar) from logged food. Always returns today based on the user's local time — do not pass a date.",
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_nutrition_targets',
    description: "Set or update the user's daily nutrition targets (calories and macros). Call this when discussing their diet goals or after adjusting their program.",
    input_schema: {
      type: 'object',
      properties: {
        calories: { type: 'number', description: 'Daily calorie target' },
        protein_g: { type: 'number', description: 'Daily protein target in grams' },
        carbs_g: { type: 'number', description: 'Daily carb target in grams' },
        fat_g: { type: 'number', description: 'Daily fat target in grams' },
        sugar_g: { type: 'number', description: 'Daily sugar limit in grams' },
      },
      required: [],
    },
  },
  {
    name: 'get_workout_plan',
    description: 'Get the user\'s current active workout plan, including cycle week and phase (build/deload/off).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_workout_plan',
    description: 'Create and activate a new personalized workout plan. MUST be called whenever you build or update a training program — do not just describe a plan in text without calling this tool.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        plan_json: {
          type: 'object',
          description: 'Must use exactly these keys: squat_day, bench_day, deadlift_day. Every day must include pre_workout activation, a fully detailed main_lift with warmup sets, RPE, rest time, and 4-5 accessories with rest times.',
          properties: {
            squat_day: { $ref: '#/definitions/training_day' },
            bench_day: { $ref: '#/definitions/training_day' },
            deadlift_day: { $ref: '#/definitions/training_day' },
            notes: { type: 'string', description: 'Overall plan notes, periodization context, progression instructions' },
          },
          required: ['squat_day', 'bench_day', 'deadlift_day'],
          definitions: {
            training_day: {
              type: 'object',
              properties: {
                pre_workout: { type: 'string', description: '5-10 min activation routine: specific mobility drills and activation exercises for this day (e.g. "5 min easy bike, hip flexor stretch 30s/side, goblet squat x10, glute bridge x15")' },
                main_lift: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    sets: { type: 'integer' },
                    reps: { type: 'string', description: 'e.g. "4", "3-5", "1" — use the exact rep target' },
                    rpe: { type: 'number', description: 'Target RPE 6-10. RPE 7 = 3 reps in reserve, RPE 8 = 2 RIR, RPE 9 = 1 RIR' },
                    intensity_pct: { type: 'number', description: 'Approx % of 1RM (e.g. 80). Used alongside RPE for context.' },
                    rest_minutes: { type: 'number', description: 'Rest between working sets in minutes. Main lifts: 3-5 min.' },
                    warmup: {
                      type: 'array',
                      description: 'Warm-up set pyramid before working sets. Always include: bar x10, ~40% x5, ~55% x3, ~70% x2, then optionally ~80% x1 before heavy sets.',
                      items: {
                        type: 'object',
                        properties: {
                          label: { type: 'string', description: 'e.g. "Bar", "40% 1RM", "55% 1RM", "70% 1RM"' },
                          reps: { type: 'integer' },
                        },
                        required: ['label', 'reps'],
                      },
                    },
                    notes: { type: 'string', description: 'Key technique cues and coaching notes for this lift' },
                  },
                  required: ['name', 'sets', 'reps', 'rpe', 'rest_minutes', 'warmup'],
                },
                accessories: {
                  type: 'array',
                  description: '4-5 accessories per day. Include rest_minutes on each. Notes should explain WHY this exercise is chosen (what weakness it addresses).',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      sets: { type: 'integer' },
                      reps: { type: 'string' },
                      rest_minutes: { type: 'number', description: 'Accessories: 60s-2min depending on load' },
                      notes: { type: 'string', description: 'Why this exercise, load/intensity guidance (e.g. "RPE 7", "moderate weight"), technique cue' },
                    },
                    required: ['name', 'sets', 'reps', 'rest_minutes'],
                  },
                },
                cooldown: {
                  type: 'array',
                  description: '4-6 post-workout stretches. Hold times should match the muscle groups trained that day.',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      duration_seconds: { type: 'integer', description: 'Hold or duration in seconds (e.g. 60)' },
                      notes: { type: 'string', description: 'Brief cue or instruction' },
                    },
                    required: ['name', 'duration_seconds'],
                  },
                },
              },
              required: ['pre_workout', 'main_lift', 'accessories', 'cooldown'],
            },
          },
        },
        cycle_start_date: { type: 'string', description: 'YYYY-MM-DD (defaults to today)' },
      },
      required: ['name', 'plan_json'],
    },
  },
  {
    name: 'send_test_notification',
    description: 'Send a test push notification to the user to verify their notification setup is working.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'log_workout',
    description: 'Log completed sets for a workout exercise.',
    input_schema: {
      type: 'object',
      properties: {
        day_type: { type: 'string', enum: ['squat', 'bench', 'deadlift'] },
        exercise_name: { type: 'string' },
        sets_completed: { type: 'integer' },
        cycle_week: { type: 'integer' },
        plan_id: { type: 'string' },
      },
      required: ['day_type', 'exercise_name', 'sets_completed', 'cycle_week'],
    },
  },
];

async function executeTool(toolName, toolInput, userId, dateContext = {}) {
  const db = getDb();

  if (toolName === 'get_user_profile') {
    const user = await db.prepare('SELECT email, goal, target_weight_lbs, created_at FROM users WHERE id = ?').get([userId]);
    const latestWeight = await db.prepare('SELECT weight_lbs, logged_at FROM weight_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1').get([userId]);
    const weightCount = await db.prepare('SELECT COUNT(*) as c FROM weight_logs WHERE user_id = ?').get([userId]);
    const plan = await db.prepare('SELECT id, name, cycle_start_date FROM workout_plans WHERE user_id = ? AND is_active = 1').get([userId]);
    let cycleWeek = null, phase = null;
    if (plan?.cycle_start_date) {
      const days = Math.floor((Date.now() - new Date(plan.cycle_start_date)) / 86400000);
      cycleWeek = (Math.floor(days / 7) % 14) + 1;
      phase = cycleWeek === 7 ? 'deload' : cycleWeek === 14 ? 'off' : 'build';
    }
    return JSON.stringify({ ...user, latest_weight: latestWeight, weight_entries_total: weightCount?.c, active_plan: plan ? { ...plan, cycle_week: cycleWeek, phase } : null });
  }

  if (toolName === 'log_weight') {
    const id = uuidv4();
    await db.prepare('INSERT INTO weight_logs (id, user_id, weight_lbs, logged_at) VALUES (?, ?, ?, ?)')
      .run([id, userId, toolInput.weight_lbs, toolInput.logged_at || new Date().toISOString()]);
    return JSON.stringify({ ok: true, id, weight_lbs: toolInput.weight_lbs });
  }

  if (toolName === 'get_prs') {
    const prs = await db.prepare(`
      SELECT exercise_name, MAX(weight_lbs) as best_weight_lbs, reps, MAX(logged_at) as logged_at
      FROM pr_logs WHERE user_id = ?
      GROUP BY exercise_name, reps ORDER BY exercise_name ASC
    `).all([userId]);
    return JSON.stringify(prs);
  }

  if (toolName === 'update_pr') {
    const id = uuidv4();
    await db.prepare('INSERT INTO pr_logs (id, user_id, exercise_name, weight_lbs, reps, logged_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run([id, userId, toolInput.exercise_name, toolInput.weight_lbs, toolInput.reps, new Date().toISOString()]);
    return JSON.stringify({ ok: true, id });
  }

  if (toolName === 'log_food') {
    const foodId = uuidv4();
    await db.prepare(`
      INSERT INTO foods (id, user_id, name, calories, protein_g, carbs_g, fat_g, sugar_g, serving_size, serving_unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, name) DO NOTHING
    `).run([foodId, userId, toolInput.name, toolInput.calories, toolInput.protein_g || 0, toolInput.carbs_g || 0, toolInput.fat_g || 0, toolInput.sugar_g || 0, toolInput.serving_size || 1, toolInput.serving_unit || 'serving']);
    const food = await db.prepare('SELECT id FROM foods WHERE user_id = ? AND name = ?').get([userId, toolInput.name]);
    const logId = uuidv4();
    // Always use server time — never trust logged_at from Claude (it often passes a bare
    // date string like "2026-07-21" which PostgreSQL stores as UTC midnight, placing the
    // entry outside the user's local-day bounds and making it invisible in the log tab.
    await db.prepare('INSERT INTO nutrition_logs (id, user_id, food_id, servings, logged_at) VALUES (?, ?, ?, ?, ?)')
      .run([logId, userId, food.id, toolInput.servings || 1, new Date().toISOString()]);
    return JSON.stringify({ ok: true, food_id: food.id, log_id: logId });
  }

  if (toolName === 'search_food_library') {
    const foods = await db.prepare("SELECT * FROM foods WHERE user_id = ? AND name ILIKE ? ORDER BY name ASC LIMIT 10").all([userId, `%${toolInput.query}%`]);
    return JSON.stringify(foods);
  }

  if (toolName === 'get_nutrition_summary') {
    // Always use browser-provided local-day bounds — the server doesn't know the user's
    // timezone so any server-side date math would be wrong for non-UTC users.
    const start = dateContext.dayStart || new Date(new Date().setHours(0,0,0,0)).toISOString();
    const end = dateContext.dayEnd || new Date(new Date().setHours(24,0,0,0)).toISOString();
    const totals = await db.prepare(`
      SELECT COUNT(*) as entries,
        ROUND(SUM(nl.servings * f.calories)::numeric, 1) as total_calories,
        ROUND(SUM(nl.servings * f.protein_g)::numeric, 1) as total_protein_g,
        ROUND(SUM(nl.servings * f.carbs_g)::numeric, 1) as total_carbs_g,
        ROUND(SUM(nl.servings * f.fat_g)::numeric, 1) as total_fat_g,
        ROUND(SUM(nl.servings * f.sugar_g)::numeric, 1) as total_sugar_g
      FROM nutrition_logs nl JOIN foods f ON f.id = nl.food_id
      WHERE nl.user_id = ? AND nl.logged_at >= ?::timestamptz AND nl.logged_at < ?::timestamptz
    `).get([userId, start, end]);
    const items = await db.prepare(`
      SELECT f.name, nl.servings, f.calories, f.protein_g, f.carbs_g, f.fat_g, f.sugar_g
      FROM nutrition_logs nl JOIN foods f ON f.id = nl.food_id
      WHERE nl.user_id = ? AND nl.logged_at >= ?::timestamptz AND nl.logged_at < ?::timestamptz
      ORDER BY nl.logged_at ASC
    `).all([userId, start, end]);
    return JSON.stringify({ date: dateContext.localDate, ...totals, items });
  }

  if (toolName === 'set_nutrition_targets') {
    const allowed = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'sugar_g'];
    const update = Object.fromEntries(Object.entries(toolInput).filter(([k]) => allowed.includes(k)));
    const row = await db.prepare('SELECT nutrition_targets FROM users WHERE id = ?').get([userId]);
    const merged = { ...(row?.nutrition_targets || {}), ...update };
    await db.prepare('UPDATE users SET nutrition_targets = ?::jsonb WHERE id = ?').run([JSON.stringify(merged), userId]);
    return JSON.stringify({ ok: true, targets: merged });
  }

  if (toolName === 'get_workout_plan') {
    const plan = await db.prepare('SELECT * FROM workout_plans WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1').get([userId]);
    if (!plan) return JSON.stringify(null);
    let cycleWeek = null, phase = 'build';
    if (plan.cycle_start_date) {
      const days = Math.floor((Date.now() - new Date(plan.cycle_start_date)) / 86400000);
      cycleWeek = (Math.floor(days / 7) % 14) + 1;
      phase = cycleWeek === 7 ? 'deload' : cycleWeek === 14 ? 'off' : 'build';
    }
    return JSON.stringify({ ...plan, plan_json: JSON.parse(plan.plan_json), cycle_week: cycleWeek, phase });
  }

  if (toolName === 'create_workout_plan') {
    console.log('[tool] create_workout_plan called, name:', toolInput.name);
    console.log('[tool] plan_json keys:', Object.keys(toolInput.plan_json || {}));
    await db.prepare('UPDATE workout_plans SET is_active = 0 WHERE user_id = ?').run([userId]);
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO workout_plans (id, user_id, name, plan_json, is_active, cycle_start_date)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run([id, userId, toolInput.name, JSON.stringify(toolInput.plan_json), toolInput.cycle_start_date || new Date().toISOString().split('T')[0]]);
    console.log('[tool] plan saved with id:', id);
    return JSON.stringify({ ok: true, id, name: toolInput.name });
  }

  if (toolName === 'send_test_notification') {
    const sub = await db.prepare('SELECT subscription_json FROM push_subscriptions WHERE user_id = ?').get([userId]);
    if (!sub) return JSON.stringify({ ok: false, error: 'No push subscription found. Open the app from your home screen icon and grant notification permission first.' });
    const webpush = require('web-push');
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(process.env.VAPID_EMAIL, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    }
    try {
      await webpush.sendNotification(JSON.parse(sub.subscription_json), JSON.stringify({
        title: 'FitnessAI — push works!',
        body: 'Notifications are set up correctly.',
        url: '/',
      }));
      return JSON.stringify({ ok: true });
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').run([userId]);
        return JSON.stringify({ ok: false, error: 'Subscription expired. Re-open the app from your home screen to re-register.' });
      }
      return JSON.stringify({ ok: false, error: err.message });
    }
  }

  if (toolName === 'log_workout') {
    const id = uuidv4();
    await db.prepare(`
      INSERT INTO workout_logs (id, user_id, plan_id, cycle_week, day_type, exercise_name, sets_completed, logged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run([id, userId, toolInput.plan_id || null, toolInput.cycle_week, toolInput.day_type, toolInput.exercise_name, toolInput.sets_completed, new Date().toISOString()]);
    return JSON.stringify({ ok: true, id });
  }

  return JSON.stringify({ error: `Unknown tool: ${toolName}` });
}

module.exports = { TOOL_DEFINITIONS, executeTool };
