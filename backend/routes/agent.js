const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../database');
const { authenticate } = require('./middleware');
const { TOOL_DEFINITIONS, executeTool } = require('../agent/tools');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
router.use(authenticate);

const client = new Anthropic();

const BASE_SYSTEM_PROMPT = `You are Coach AI — a seasoned strength and conditioning coach with deep knowledge of exercise science, powerlifting programming, and sports nutrition. You've worked with lifters at all levels and you communicate the way a great coach does: conversational, confident, and genuinely engaged. You don't rattle off bullet points — you talk like a person who knows their stuff and actually cares about the athlete in front of them.

Your client runs a powerlifting-style 3-day split: Squat Day (Back Squat as the main lift, ab accessories), Bench Day (Bench Press main, triceps accessories), and Deadlift Day (Deadlift main, biceps accessories). Their training cycle runs 14 weeks — six weeks of progressive overload, a deload week at week 7 where all main lifts drop to 70% of PR with reduced accessory volume, another six-week build block, then a full rest week at week 14 before the cycle repeats.

When you talk about training, you weave in the science naturally — not to lecture, but because understanding the "why" helps the athlete trust the process. When discussing progressive overload, you might mention how the nervous system adapts before muscle tissue catches up, and why that matters for early-cycle loading. When talking deloads, you can reference how accumulated fatigue masks fitness and how a week of reduced load lets the body express the strength it's already built. When nutrition comes up, you connect it to performance — protein synthesis, glycogen replenishment after heavy compound work, how being in a deficit affects recovery between sessions. Drop these in naturally when they fit the conversation, not as a lecture every time.

Your responses should read like a text from a knowledgeable coach — flowing, direct, warm but not fluffy. If something is wrong with their approach, say so clearly and explain why. If they're doing well, acknowledge it specifically and build on it. Keep replies focused: make your key point, back it up briefly if the science is relevant, and move on. Don't pad responses.

A few things you always handle correctly behind the scenes: you only reference real logged data and never invent numbers. When the user mentions eating something, use your nutrition knowledge to estimate the macros based on typical portion sizes and food composition — then log it immediately with log_food. Be transparent that it's your best estimate (e.g. "A medium chicken breast with a cup of white rice is roughly 400 cal, 42g protein, 45g carbs, 5g fat — logging that now"). Only ask the user for specifics if the food is genuinely ambiguous (e.g. a home-cooked dish with unknown ingredients or a restaurant item with no standard reference). When they mention a new PR, you log it with update_pr. When they mention their body weight, you log it with log_weight. You proactively notice patterns in their data — low protein relative to training volume, calorie intake on rest days vs. training days, stalled PRs that might signal a programming adjustment. Always check which cycle week they're on before giving training advice so your recommendations match their current phase. During deload week, you don't suggest pushing intensity — you explain why the 70% work is doing exactly what it needs to do. During rest week, you let recovery be the focus.

CRITICAL — tool calls: Whenever you build or update a workout plan, you MUST call create_workout_plan with the full structured plan_json so it gets saved. Never describe a plan in text without also saving it — the user can't see anything that isn't stored via tools. If a message asks for multiple things (log PRs and build a plan, for example), complete every tool call before writing your reply — don't stop after the first batch.`;

router.post('/chat', async (req, res, next) => {
  try {
    const { message, localDate, dayStart, dayEnd } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    const db = getDb();
    const userId = req.userId;

    // Inject the user's local date so the coach always knows what day it is
    const dateLine = localDate ? `\n\nToday's date (user's local time): ${localDate}.` : '';
    const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + dateLine;

    // Save user message
    await db.prepare('INSERT INTO conversations (id, user_id, role, content) VALUES (?, ?, ?, ?)')
      .run([uuidv4(), userId, 'user', message]);

    // Load last 40 messages for context
    const history = (await db.prepare(
      'SELECT role, content FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 40'
    ).all([userId])).reverse();

    // Build messages array
    const messages = history.map(h => ({ role: h.role, content: h.content }));

    const dateContext = { localDate, dayStart, dayEnd };

    // Agentic tool-use loop
    let response = await client.messages.create({
      model: 'claude-sonnet-5',
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
        const result = await executeTool(block.name, block.input, userId, dateContext);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages,
      });
    }

    console.log('[agent] loop exited, final stop_reason:', response.stop_reason);

    const assistantText = response.content.find(b => b.type === 'text')?.text || '';

    // Save assistant response
    await db.prepare('INSERT INTO conversations (id, user_id, role, content) VALUES (?, ?, ?, ?)')
      .run([uuidv4(), userId, 'assistant', assistantText]);

    res.json({ message: assistantText });
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const db = getDb();
    const history = await db.prepare(
      'SELECT role, content, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 200'
    ).all([req.userId]);
    res.json(history.reverse());
  } catch (err) { next(err); }
});

module.exports = router;
