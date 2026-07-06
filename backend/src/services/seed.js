const { getDb } = require('../db');

const DEFAULT_FEED_URL = 'https://rss.app/feeds/_u8zC1uDC9Whqhhut.xml';

/**
 * Insert the default feed if the feeds table is empty.
 */
function seedDefaultFeed() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS cnt FROM feeds').get();
  if (count.cnt === 0) {
    try {
      db.prepare('INSERT OR IGNORE INTO feeds (url, title, active) VALUES (?, ?, 1)').run(
        DEFAULT_FEED_URL,
        'Veille IA (default)'
      );
      console.log(`Seed: inserted default feed "${DEFAULT_FEED_URL}"`);
    } catch (err) {
      console.error('Seed: failed to insert default feed:', err.message);
    }
  } else {
    console.log(`Seed: feeds table already has ${count.cnt} feed(s), skipping seed.`);
  }
}

module.exports = { seedDefaultFeed };
