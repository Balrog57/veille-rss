/**
 * Prune old editions and articles beyond the retention period.
 * Editions are removed by their bucket date; articles are removed by their pub_date.
 */
const { getDb } = require('../db');

/**
 * Delete editions whose bucket is older than `days` days,
 * and articles whose pub_date is older than `days` days.
 * Returns counts of what was deleted.
 */
function pruneOldEditions(days) {
  if (!days || days < 1) return { deletedEditions: 0, deletedArticles: 0 };
  const db = getDb();
  // Cutoff is N days ago, in UTC ISO
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const transaction = db.transaction(() => {
    // Find old editions
    const oldEditions = db.prepare('SELECT id FROM editions WHERE bucket < ?').all(cutoff);
    const editionIds = oldEditions.map(e => e.id);

    let deletedArticles = 0;
    let deletedEditions = 0;
    if (editionIds.length > 0) {
      const delArticles = db.prepare('DELETE FROM articles WHERE edition_id IN (' + editionIds.map(() => '?').join(',') + ')').run(...editionIds);
      deletedArticles = delArticles.changes;
      const delEditions = db.prepare('DELETE FROM editions WHERE id IN (' + editionIds.map(() => '?').join(',') + ')').run(...editionIds);
      deletedEditions = delEditions.changes;
    }
    // Also delete articles with no edition (shouldn't happen, but safety)
    const stray = db.prepare('DELETE FROM articles WHERE pub_date < ? AND edition_id NOT IN (SELECT id FROM editions)').run(cutoff);
    deletedArticles += stray.changes;

    return { deletedEditions, deletedArticles };
  });

  const result = transaction();
  // Vacuum to reclaim disk space
  try { db.exec('VACUUM'); } catch (e) { /* ignore */ }
  return result;
}

module.exports = { pruneOldEditions };
