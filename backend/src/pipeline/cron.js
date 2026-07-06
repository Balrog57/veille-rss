const cron = require('node-cron');
const config = require('../config');
const { runTick } = require('./run');

let task = null;

function startCron() {
  // Every 6h at 00:00, 06:00, 12:00, 18:00 Paris time
  const expression = '0 0,6,12,18 * * *';

  console.log(`Starting cron with expression "${expression}" in timezone "${config.timezone}"`);

  task = cron.schedule(
    expression,
    async () => {
      console.log('[Cron] Tick triggered');
      try {
        await runTick();
      } catch (err) {
        console.error('[Cron] Tick failed:', err.message);
      }
    },
    {
      timezone: config.timezone,
      name: 'veille-tick',
    }
  );

  console.log('Cron scheduled. Next runs:');
  for (const [name, t] of cron.getTasks().entries()) {
    console.log(`  - ${name}`);
  }
}

function stopCron() {
  if (task) {
    task.stop();
    task.destroy();
    task = null;
    console.log('Cron stopped.');
  }
}

module.exports = { startCron, stopCron };
