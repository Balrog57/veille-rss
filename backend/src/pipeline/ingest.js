const Parser = require('rss-parser');
const { getDb } = require('../db');
const { canonicalUrlHash } = require('../utils/hash');
const { stripHtml } = require('../utils/html');

const MAX_ARTICLES_PER_FEED = 200;
const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent': 'VeilleRSS/1.0 (+https://github.com/noveltrad/veille-rss)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

/**
 * Extract the best available image URL from an RSS item.
 */
function extractImage(item) {
  // enclosure type="image/*"
  if (item.enclosure && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
    return item.enclosure.url;
  }

  // media:thumbnail or media:content
  if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$'].url) {
    return item['media:thumbnail']['$'].url;
  }
  if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) {
    return item['media:content']['$'].url;
  }

  // itunes:image
  if (item['itunes:image'] && item['itunes:image']['$'] && item['itunes:image']['$'].href) {
    return item['itunes:image']['$'].href;
  }

  return null;
}

/**
 * Ingest all active feeds and return raw articles.
 * Returns array of { title, description, link, url_hash, image_url, source, pubDate, feedId }
 */
async function ingestAllFeeds() {
  const db = getDb();
  const feeds = db.prepare('SELECT id, url, title FROM feeds WHERE active = 1').all();

  if (feeds.length === 0) {
    console.log('[Ingest] No active feeds found.');
    return [];
  }

  const allArticles = [];

  for (const feed of feeds) {
    console.log(`[Ingest] Fetching feed: ${feed.url}`);
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items || [];
      console.log(`[Ingest]   Got ${items.length} items from "${feed.title || feed.url}"`);

      // Cap articles per feed
      const capped = items.slice(0, MAX_ARTICLES_PER_FEED);

      for (const item of capped) {
        const title = stripHtml(item.title || '').slice(0, 500);
        const description = stripHtml(item.contentSnippet || item.content || '').slice(0, 5000);
        const link = item.link || '';
        const url_hash = canonicalUrlHash(link);
        const image_url = extractImage(item);
        const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
        const source = feed.title || new URL(feed.url).hostname;

        if (!title && !description) continue; // skip empty items
        if (!link) continue; // skip items without a link

        allArticles.push({
          title,
          description,
          link,
          url_hash,
          image_url,
          source,
          pubDate,
          feedId: feed.id,
        });
      }
    } catch (err) {
      console.error(`[Ingest] Error fetching feed "${feed.url}":`, err.message);
    }
  }

  console.log(`[Ingest] Total raw articles: ${allArticles.length}`);
  return allArticles;
}

module.exports = { ingestAllFeeds };
