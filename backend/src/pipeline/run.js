const { getDb } = require('../db');
const { floorTo6hBucket } = require('../services/bucket');
const settings = require('../services/settings');
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
    const s = settings.get();
    const bucket = floorTo6hBucket(new Date(), s.timezone);
    console.log(`[Run] Starting tick for bucket: ${bucket} (tz=${s.timezone})`);

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
        formatEditionTitle(bucket, s.timezone)
      );
      return { editionId: info.lastInsertRowid, articleCount: 0 };
    }

    // Step 2: Filter articles to align with the edition's time window.
    // Everything is stored in UTC. The bucket is the UTC instant of the
    // cron tick in the configured timezone. We keep only articles whose
    // pub_date is reasonably close to the bucket:
    //   - Not older than (bucket - maxBucketAgeHours): too-old articles are
    //     either in earlier editions or should be dropped on first run.
    //   - Not more than 2h in the future: tolerates timezone quirks in
    //     feeds (e.g. rss.app sets pubDate slightly ahead).
    // The configured timezone is for display only — the bucket is a single
    // UTC instant (e.g. 12:00 Paris in summer = 10:00Z), so two users in
    // Paris and Berlin will see the same edition at the same wall-clock time.
    console.log('[Run] Step 2: Filter by bucket window');
    const nowMs = Date.now();
    const bucketMs = new Date(bucket).getTime();
    const maxBucketAgeHours = 6;
    const maxBucketAgeMs = maxBucketAgeHours * 60 * 60 * 1000;
    const futureToleranceMs = 2 * 60 * 60 * 1000;
    const windowedArticles = rawArticles.filter((a) => {
      const t = Date.parse(a.pubDate);
      if (Number.isNaN(t)) return true; // keep if unparseable
      // Article must be within [bucket - maxBucketAgeHours, bucket + 2h]
      return t >= bucketMs - maxBucketAgeMs && t <= bucketMs + futureToleranceMs;
    });
    const outOfWindow = rawArticles.length - windowedArticles.length;
    const outOfWindowFuture = rawArticles.filter((a) => {
      const t = Date.parse(a.pubDate);
      return !Number.isNaN(t) && t > bucketMs + futureToleranceMs;
    }).length;
    const outOfWindowPast = rawArticles.filter((a) => {
      const t = Date.parse(a.pubDate);
      return !Number.isNaN(t) && t < bucketMs - maxBucketAgeMs;
    }).length;
    if (outOfWindow > 0) {
      console.log(`[Run] Filtered ${outOfWindow} articles out of window (${outOfWindowPast} too old, ${outOfWindowFuture} too future)`);
    }
    if (windowedArticles.length === 0) {
      console.log('[Run] No articles in window, creating empty edition.');
      const info = db.prepare('INSERT INTO editions (bucket, title) VALUES (?, ?)').run(
        bucket,
        formatEditionTitle(bucket, s.timezone)
      );
      return { editionId: info.lastInsertRowid, articleCount: 0 };
    }

    // Step 3: Dedup
    console.log('[Run] Step 3: Dedup');
    const deduped = await dedupArticles(windowedArticles);
    if (deduped.length === 0) {
      console.log('[Run] No articles after dedup, creating empty edition.');
      const info = db.prepare('INSERT INTO editions (bucket, title) VALUES (?, ?)').run(
        bucket,
        formatEditionTitle(bucket, s.timezone)
      );
      return { editionId: info.lastInsertRowid, articleCount: 0 };
    }

    // Step 4: Summarize
    console.log('[Run] Step 4: Summarize');
    const summarized = await summarizeAll(deduped);

    // Step 5: Persist
    console.log('[Run] Step 5: Persist');
    const editionTitle = formatEditionTitle(bucket, s.timezone);

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

function formatEditionTitle(bucket, tz) {
  return `Édition du ${new Date(bucket).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })}`;
}

module.exports = { runTick };
