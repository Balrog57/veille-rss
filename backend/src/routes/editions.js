const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../auth');

// GET /api/editions — list all editions
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const editions = db.prepare(
    'SELECT id, bucket, title, created_at FROM editions ORDER BY bucket DESC'
  ).all();
  res.json(editions);
});

// GET /api/editions/:id — get edition with articles
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid edition ID' });
  }

  const edition = db.prepare('SELECT id, bucket, title, created_at FROM editions WHERE id = ?').get(id);
  if (!edition) {
    return res.status(404).json({ error: 'Edition not found' });
  }

  const articles = db.prepare(
    'SELECT id, title, description, link, image_url, source, pub_date, summary, summary_fallback, position FROM articles WHERE edition_id = ? ORDER BY position ASC'
  ).all(id);

  res.json({ ...edition, articles });
});

module.exports = router;
