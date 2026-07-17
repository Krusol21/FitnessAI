require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3002;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '15mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/nutrition', require('./routes/nutrition'));
app.use('/api/workouts', require('./routes/workouts'));
app.use('/api/scan', require('./routes/scan'));
app.use('/api/agent', require('./routes/agent'));
app.use('/api/notifications', require('./routes/notifications'));

app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`[server] FitnessAI running on port ${PORT}`));
});
