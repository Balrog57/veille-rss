const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const config = require('./config');
const { getDb } = require('./db');
const { requireAuth } = require('./auth');
const { seedDefaultFeed } = require('./services/seed');
const { waitForModel } = require('./services/ollama');
const { startCron } = require('./pipeline/cron');
const { runTick } = require('./pipeline/run');
const { floorTo6hBucket } = require('./services/bucket');

const app = express();

// --- Middleware ---
app.use(helmet());
app.use(cors({
  origin: config.frontendOrigin,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser(config.sessionSecret));

// --- Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/feeds', require('./routes/feeds'));
app.use('/api/editions', require('./routes/editions'));
app.use('/api/articles', require('./routes/articles'));

// POST /api/admin/run-tick — manual tick trigger (auth required)
// Idempotent: skips if an edition already exists for the current 6h bucket.
app.post('/api/admin/run-tick', requireAuth, async (req, res) => {
  try {
    const result = await runTick();
    res.json(result);
  } catch (err) {
    console.error('[Tick] Pipeline error:', err.message);
    res.status(500).json({ error: 'Pipeline tick failed' });
  }
});

// POST /api/admin/force-tick — force a fresh tick for the current 6h bucket.
// Deletes the existing edition for the current bucket (if any) and re-runs.
app.post('/api/admin/force-tick', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const bucket = floorTo6hBucket(new Date());
    const existing = db.prepare('SELECT id FROM editions WHERE bucket = ?').get(bucket);
    if (existing) {
      db.prepare('DELETE FROM articles WHERE edition_id = ?').run(existing.id);
      db.prepare('DELETE FROM editions WHERE id = ?').run(existing.id);
      console.log(`[ForceTick] Deleted existing edition ${existing.id} for bucket ${bucket}`);
    }
    const result = await runTick();
    res.json(result);
  } catch (err) {
    console.error('[ForceTick] Pipeline error:', err.message);
    res.status(500).json({ error: 'Pipeline tick failed' });
  }
});

// --- Startup ---
async function startup() {
  console.log('=== Veille RSS Backend ===');

  // Initialize database
  getDb();
  console.log('Database initialized.');

  // Seed default feed on first boot
  seedDefaultFeed();

  // Wait for Ollama model to be available
  const modelReady = await waitForModel(300000); // 5 min timeout
  if (!modelReady) {
    console.warn('Proceeding without Ollama model. Summaries will fall back to original descriptions.');
  }

  // Start Express
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Backend listening on port ${config.port}`);
  });

  // Start cron (only after model check, but doesn't depend on model)
  startCron();
  console.log('Cron started. Pipeline will run at 00:00, 06:00, 12:00, 18:00 Paris time.');
  console.log(`Manual trigger: POST /api/admin/run-tick (auth required)`);
}

startup().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
