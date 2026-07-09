const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const cron = require('node-cron');
const config = require('./config');
const settings = require('./services/settings');
const { getDb } = require('./db');
const { requireAuth } = require('./auth');
const { seedDefaultFeed } = require('./services/seed');
const { waitForModel } = require('./services/ollama');
const { startCron, stopCron } = require('./pipeline/cron');
const { runTick } = require('./pipeline/run');
const { floorTo6hBucket } = require('./services/bucket');
const { pruneOldEditions } = require('./pipeline/prune');

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

// GET /api/admin/settings — read current settings
app.get('/api/admin/settings', requireAuth, (req, res) => {
  res.json(settings.get());
});

// PUT /api/admin/settings — update settings (timezone, cron, retention, maxAge)
// Also restarts the cron if cronExpr or timezone changed.
app.put('/api/admin/settings', requireAuth, (req, res) => {
  const allowed = ['timezone', 'cronExpr', 'retentionDays'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields provided' });
  }
  // Validate cron expr if provided
  if (updates.cronExpr && !cron.validate(updates.cronExpr)) {
    return res.status(400).json({ error: `Invalid cron expression: ${updates.cronExpr}` });
  }
  // Validate timezone if provided
  if (updates.timezone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: updates.timezone }).format(new Date());
    } catch (e) {
      return res.status(400).json({ error: `Invalid timezone: ${updates.timezone}` });
    }
  }
  const before = settings.get();
  const after = settings.save(updates);
  // Restart cron if schedule or timezone changed
  if (after.cronExpr !== before.cronExpr || after.timezone !== before.timezone) {
    stopCron();
    startCron();
  }
  console.log(`[Settings] Updated: ${JSON.stringify(updates)}`);
  res.json(after);
});

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
// Always forces: never returns "skipped". If the pipeline is already running,
// returns 409 so the frontend can inform the user.
app.post('/api/admin/force-tick', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const tz = settings.get().timezone;
    const bucket = floorTo6hBucket(new Date(), tz);
    const existing = db.prepare('SELECT id FROM editions WHERE bucket = ?').get(bucket);
    if (existing) {
      db.prepare('DELETE FROM articles WHERE edition_id = ?').run(existing.id);
      db.prepare('DELETE FROM editions WHERE id = ?').run(existing.id);
      console.log(`[ForceTick] Deleted existing edition ${existing.id} for bucket ${bucket}`);
    }
    const result = await runTick();
    // force-tick should never be skipped (we deleted the edition above), but
    // if it is (race), still return success with the existing edition info.
    res.json(result);
  } catch (err) {
    console.error('[ForceTick] Pipeline error:', err.message);
    res.status(500).json({ error: 'Pipeline tick failed' });
  }
});

// POST /api/admin/prune — manual cleanup with optional { days } override.
// If days omitted, uses the current retentionDays setting.
app.post('/api/admin/prune', requireAuth, (req, res) => {
  const days = parseInt(req.body && req.body.days, 10) || settings.get().retentionDays;
  if (days < 1 || days > 3650) {
    return res.status(400).json({ error: 'days must be between 1 and 3650' });
  }
  const before = countEditions();
  const result = pruneOldEditions(days);
  const after = countEditions();
  console.log(`[Prune] Manual prune at ${days} days: ${result.deletedEditions} editions, ${result.deletedArticles} articles deleted`);
  res.json({ ...result, days, editionsBefore: before, editionsAfter: after });
});

// --- Startup ---
// NOTE: normalizeLegacyBuckets() was removed — it incorrectly treated valid
// Europe/Paris buckets (UTC 22/04/10/16) as legacy and corrupted them by
// shifting to UTC 00/06/12/18. All buckets created by floorTo6hBucket() are
// correct; legacy editions have already been handled manually.

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

  // Start cron
  startCron();
  const s = settings.get();
  console.log(`Cron started. Schedule: "${s.cronExpr}" in ${s.timezone}, retention: ${s.retentionDays} days.`);
  console.log('Manual triggers:');
  console.log('  POST /api/admin/run-tick     (idempotent, skip if current bucket exists)');
  console.log('  POST /api/admin/force-tick   (delete current bucket edition, re-run)');
  console.log('  POST /api/admin/prune         (manual cleanup, optional { days } body)');
  console.log('  GET/PUT /api/admin/settings   (read/update settings)');
}

function countEditions() {
  try { return getDb().prepare('SELECT COUNT(*) AS n FROM editions').get().n; }
  catch { return 0; }
}

startup().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
