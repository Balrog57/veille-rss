const { getDb } = require('../db');
const { floorTo6hBucket } = require('../services/bucket');
const { ingestAllFeeds } = require('./ingest');
const { dedupArticles } = require('./dedup');
const { summarizeAll } = require('./summarize');

// In-process lock to prevent concurrent runs
let running = false;

/**
 * Execute one pipeline tick: ingest -> dedup -> summarize -> persist.
 * Idempotent: checks if an edition for the current 6h bucket already exists.
 */
async function runTick() {
  if (running) {
    console.log('[Run] Pipeline already running, skipping.');
    return { skipped: true, reason: 'already_running' };
  }

  running = true;
  try {
    const db = getDb();
    const bucket = floorTo6hBucket(new Date());
    console.log(`[Run] Starting tick for bucket: ${bucket}`);

    // Check if edition already exists for this bucket
    const existing = db.prepare('SELECT id FROM editions WHERE bucket = ?').get(bucket);
    if (existing) {
      console.log(`[Run] Edition for bucket ${bucket} already exists (id=${existing.id}), skipping.`);
      return { skipped: true, reason: 'already_exists', editionId: existing.id };
    }

    // Step 1: Ingest
    console.log('[Run] Step 1: Ingest');
    const rawArticles = await ingestAllFeeds();
    if (rawArticles.length === 0) {
      console.log('[Run] No articles ingested, creating empty edition.');
      const info = db.prepare('INSERT INTO editions (bucket, title) VALUES (?, ?)').run(
        bucket,
        `Édition ${new Date(bucket).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}`
      );
      return { editionId: info.lastInsertRowid, articleCount: 0 };
    }

    // Step 2: Dedup
    console.log('[Run] Step 2: Dedup');
    const deduped = await dedupArticles(rawArticles);
    if (deduped.length === 0) {
      console.log('[Run] No articles after dedup, creating empty edition.');
      const info = db.prepare('INSERT INTO editions (bucket, title) VALUES (?, ?)').run(bucket, `Édition ${bucket}`);
      return { editionId: info.lastInsertRowid, articleCount: 0 };
    }

    // Step 3: Summarize
    console.log('[Run] Step 3: Summarize');
    const summarized = await summarizeAll(deduped);

    // Step 4: Persist
    console.log('[Run] Step 4: Persist');
    const editionTitle = `Édition du ${new Date(bucket).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    })}`;

    const transaction = db.transaction(() => {
      const editionInfo = db.prepare('INSERT INTO editions (bucket, title) VALUES (?, ?)').run(bucket, editionTitle);
      const editionId = editionInfo.lastInsertRowid;

      const insertArticle = db.prepare(`
        INSERT INTO articles (edition_id, url_hash, title, description, link, image_url, source, pub_date, summary, summary_fallback, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < summarized.length; i++) {
        const a = summarized[i];
        insertArticle.run(
          editionId,
          a.url_hash,
          a.title,
          a.description,
          a.link,
          a.image_url,
          a.source,
          a.pubDate,
          a.summary,
          a.summary_fallback,
          i
        );
      }

      return editionId;
    });

    const editionId = transaction();
    console.log(`[Run] Done. Edition ${editionId} created with ${summarized.length} articles.`);

    return { editionId, articleCount: summarized.length };
  } catch (err) {
    console.error('[Run] Pipeline error:', err);
    throw err;
  } finally {
    running = false;
  }
}

module.exports = { runTick };
