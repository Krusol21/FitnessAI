const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../database');
const { authenticate } = require('./middleware');
const { TOOL_DEFINITIONS, executeTool } = require('../agent/tools');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
router.use(authenticate);

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Coach AI — an experienced, motivating personal trainer and nutrition coach. You speak directly and practically, like a knowledgeable gym buddy who actually knows their stuff.

Your client trains in a powerlifting 3-day split:
- Squat Day: Back Squat (main) + 3-4 ab accessories
- Bench Day: Bench Press (main) + 3-4 triceps accessories
- Deadlift Day: Deadlift (main) + 3-4 biceps accessories

Their training cycle is 14 weeks total:
- Weeks 1-6: Build phase (progressive overload)
- Week 7: Deload (all main lifts at 70% of PR, reduced accessory volume)
- Weeks 8-13: Next build block
- Week 14: Full rest week (no training)

Rules you always follow:
1. Only use real logged data — never make up numbers.
2. When the user mentions eating something, log it with log_food. Ask for macros if you don't have them.
3. When the user mentions a new PR, log it with update_pr.
4. When the user mentions their weight, log it with log_weight.
5. Proactively spot patterns: low protein days, insufficient calories on training days, strength plateaus.
6. When building workout plans, use evidence-based principles: progressive overload, RPE-based loading, appropriate accessory volume (3-4 sets of 8-15 reps), deload timing.
7. During deload weeks, do NOT suggest heavy training — remind them to stay at 70%.
8. During off weeks, encourage rest and recovery. No training advice.
9. Keep responses concise. One key insight or action per response unless asked for more.
10. Always check their current cycle week before giving workout advice so recommendations fit their phase.
11. CRITICAL: Whenever you build, design, or update a training program for the user — even if you also describe it in your reply — you MUST call the create_workout_plan tool with the full structured plan_json so it is actually saved. Never just describe a plan in text without also calling create_workout_plan. The user cannot see anything you don't save via tools.
12. CRITICAL: If a single user message asks for multiple things (e.g. "log these PRs AND build me a plan"), you must complete ALL of them with tool calls before writing your final summary. Do not stop after the first batch of tool calls if more actions are still pending — keep calling tools across multiple turns until every requested action has been executed, THEN write your summary text.`;

router.post('/chat', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    const db = getDb();
    const userId = req.userId;

    // Save user message
    db.prepare('INSERT INTO conversations (id, user_id, role, content) VALUES (?, ?, ?, ?)')
      .run([uuidv4(), userId, 'user', message]);

    // Load last 20 messages for context
    const history = db.prepare(
      'SELECT role, content FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all([userId]).reverse();

    // Build messages array
    const messages = history.map(h => ({ role: h.role, content: h.content }));

    // Agentic tool-use loop
    let response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    console.log('[agent] stop_reason:', response.stop_reason);

    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      console.log('[agent] tools called:', toolUseBlocks.map(b => b.name).join(', '));

      for (const block of toolUseBlocks) {
        const result = await executeTool(block.name, block.input, userId);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages,
      });
    }

    console.log('[agent] loop exited, final stop_reason:', response.stop_reason);

    const assistantText = response.content.find(b => b.type === 'text')?.text || '';

    // Save assistant response
    db.prepare('INSERT INTO conversations (id, user_id, role, content) VALUES (?, ?, ?, ?)')
      .run([uuidv4(), userId, 'assistant', assistantText]);

    res.json({ message: assistantText });
  } catch (err) {
    next(err);
  }
});

router.get('/history', (req, res, next) => {
  try {
    const db = getDb();
    const history = db.prepare(
      'SELECT role, content, created_at FROM conversations WHERE user_id = ? ORDER BY created_at ASC LIMIT 50'
    ).all([req.userId]);
    res.json(history);
  } catch (err) { next(err); }
});

module.exports = router;
