const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../auth');

// PATCH /api/articles/:id — update article (position)
router.patch('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid article ID' });
  }

  const { position } = req.body;
  if (position === undefined || typeof position !== 'number' || position < 0 || !Number.isInteger(position)) {
    return res.status(400).json({ error: 'position must be a non-negative integer' });
  }

  // Verify article exists
  const article = db.prepare('SELECT id FROM articles WHERE id = ?').get(id);
  if (!article) {
    return res.status(404).json({ error: 'Article not found' });
  }

  // Simple swap logic on conflict: shift other articles
  db.transaction(() => {
    // Get current max position in same edition
    const editionInfo = db.prepare('SELECT edition_id FROM articles WHERE id = ?').get(id);
    if (!editionInfo) return;

    // Remove position from current article temporarily
    db.prepare('UPDATE articles SET position = -1 WHERE id = ?').run(id);

    // Shift positions to make room
    db.prepare(`
      UPDATE articles SET position = position + 1
      WHERE edition_id = ? AND position >= ? AND position < 999999
    `).run(editionInfo.edition_id, position);

    // Set new position
    db.prepare('UPDATE articles SET position = ? WHERE id = ?').run(position, id);
  })();

  const updated = db.prepare('SELECT id, title, position FROM articles WHERE id = ?').get(id);
  res.json(updated);
});

module.exports = router;
