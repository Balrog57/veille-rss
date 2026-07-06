const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let db = null;

function getDb() {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(config.databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.databasePath);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations();

  return db;
}

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS editions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket TEXT NOT NULL UNIQUE,
      title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      edition_id INTEGER NOT NULL,
      url_hash TEXT NOT NULL,
      title TEXT,
      description TEXT,
      link TEXT,
      image_url TEXT,
      source TEXT,
      pub_date TEXT,
      summary TEXT,
      summary_fallback INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_articles_edition_id ON articles(edition_id);
    CREATE INDEX IF NOT EXISTS idx_articles_url_hash ON articles(url_hash);
    CREATE INDEX IF NOT EXISTS idx_editions_bucket ON editions(bucket);
  `);
}

module.exports = { getDb };
