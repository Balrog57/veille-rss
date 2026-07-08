const cron = require('node-cron');
const settings = require('../services/settings');
const { runTick } = require('./run');

let task = null;
let pruneTask = null;

function startCron() {
  const s = settings.get();
  const expression = s.cronExpr;
  const tz = s.timezone;

  console.log(`Starting cron with expression "${expression}" in timezone "${tz}"`);

  // Validate the cron expression before scheduling
  if (!cron.validate(expression)) {
    console.error(`[Cron] Invalid cron expression "${expression}", falling back to "0 */6 * * *"`);
    return startCronWith('0 */6 * * *', tz);
  }

  startCronWith(expression, tz);
}

function startCronWith(expression, tz) {
  // Stop any existing task
  stopCron();

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
      timezone: tz,
      name: 'veille-tick',
    }
  );

  console.log('Cron scheduled. Next runs:');
  for (const [name, t] of cron.getTasks().entries()) {
    console.log(`  - ${name}`);
  }

  // Daily cleanup at 03:05 in the configured timezone
  pruneTask = cron.schedule(
    '5 3 * * *',
    async () => {
      console.log('[Cron] Prune triggered');
      try {
        const { pruneOldEditions } = require('./prune');
        const result = await pruneOldEditions(settings.get().retentionDays);
        console.log(`[Cron] Prune result: ${result.deletedArticles} articles, ${result.deletedEditions} editions deleted`);
      } catch (err) {
        console.error('[Cron] Prune failed:', err.message);
      }
    },
    { timezone: tz, name: 'veille-prune' }
  );
}

function stopCron() {
  if (task) {
    task.stop();
    task.destroy();
    task = null;
  }
  if (pruneTask) {
    pruneTask.stop();
    pruneTask.destroy();
    pruneTask = null;
  }
}

module.exports = { startCron, stopCron };
