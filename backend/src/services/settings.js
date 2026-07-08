/**
 * Runtime settings persisted to data/settings.json.
 * Admin can change these from the dashboard without restarting the backend.
 */
const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = process.env.SETTINGS_PATH || path.join(__dirname, '..', '..', 'data', 'settings.json');

const DEFAULTS = {
  timezone: process.env.TZ || 'Europe/Paris',
  cronExpr: process.env.CRON_EXPR || '0 */6 * * *',
  retentionDays: parseInt(process.env.RETENTION_DAYS, 10) || 90,
  maxArticleAgeHours: parseInt(process.env.MAX_ARTICLE_AGE_HOURS, 10) || 48,
};

let current = null;

function load() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    current = { ...DEFAULTS, ...parsed };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[Settings] Failed to load settings, using defaults:', err.message);
    }
    current = { ...DEFAULTS };
  }
  return current;
}

function save(updates) {
  current = { ...current, ...updates };
  // Validate
  if (current.retentionDays < 1) current.retentionDays = 1;
  if (current.retentionDays > 3650) current.retentionDays = 3650;
  if (current.maxArticleAgeHours < 1) current.maxArticleAgeHours = 1;
  if (current.maxArticleAgeHours > 720) current.maxArticleAgeHours = 720; // 30 days max
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(current, null, 2));
  } catch (err) {
    console.error('[Settings] Failed to save settings:', err.message);
  }
  return current;
}

function get() {
  if (!current) load();
  return current;
}

// Load on require
load();

module.exports = { get, load, save, DEFAULTS, SETTINGS_PATH };
