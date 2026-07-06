const path = require('path');

const config = {
  port: parseInt(process.env.PORT, 10) || 4000,
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'veille.sqlite'),
  appPassword: process.env.APP_PASSWORD,
  sessionSecret: process.env.SESSION_SECRET,
  ollamaUrl: process.env.OLLAMA_URL || 'http://ollama:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b',
  timezone: process.env.TZ || 'Europe/Paris',
  secureCookie: process.env.SECURE_COOKIE === 'true',
  // Comma-separated list of allowed frontend origins (e.g., "http://localhost:3000,http://192.168.1.98:3000")
  frontendOrigin: (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim()).filter(Boolean),
};

// Validate required config
if (!config.appPassword) {
  console.error('FATAL: APP_PASSWORD environment variable is required');
  process.exit(1);
}

if (!config.sessionSecret) {
  console.error('FATAL: SESSION_SECRET environment variable is required');
  process.exit(1);
}

module.exports = config;
