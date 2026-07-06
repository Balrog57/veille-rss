const express = require('express');
const dns = require('dns');
const net = require('net');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../auth');

const DOCKER_SERVICE_HOSTNAMES = new Set([
  'ollama', 'backend', 'pipeline-init',
  'veille-backend', 'veille-frontend', 'veille-ollama', 'veille-pipeline-init',
  'localhost',
]);

/**
 * Check if an IP address is in a private, loopback, or link-local range.
 */
function isPrivateIP(ip) {
  // IPv4 checks
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const first = parts[0];
    const second = parts[1];
    // 0.0.0.0
    if (ip === '0.0.0.0') return true;
    // 127.0.0.0/8 loopback
    if (first === 127) return true;
    // 10.0.0.0/8 private
    if (first === 10) return true;
    // 172.16.0.0/12 private
    if (first === 172 && second >= 16 && second <= 31) return true;
    // 192.168.0.0/16 private
    if (first === 192 && second === 168) return true;
    // 169.254.0.0/16 link-local
    if (first === 169 && second === 254) return true;
    return false;
  }
  // IPv6 checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase().replace(/^\[|\]$/g, '');
    // ::1 loopback
    if (normalized === '::1') return true;
    // :: unspecified
    if (normalized === '::') return true;
    // fe80::/10 link-local
    if (normalized.startsWith('fe80:')) return true;
    // fc00::/7 unique-local (private)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    return false;
  }
  return false;
}

// GET /api/feeds — list all feeds
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const feeds = db.prepare('SELECT id, url, title, active, created_at FROM feeds ORDER BY created_at DESC').all();
  res.json(feeds);
});

// POST /api/feeds — add a new feed
router.post('/', requireAuth, async (req, res) => {
  const { url, title } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Validate URL by attempting a fetch and checking for RSS/XML content
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // SSRF protection: reject private/internal hostnames and IPs
  const hostname = parsedUrl.hostname.toLowerCase();

  if (DOCKER_SERVICE_HOSTNAMES.has(hostname)) {
    return res.status(400).json({ error: 'Invalid URL: local/internal hostnames are not allowed' });
  }

  if (net.isIP(hostname)) {
    // IP literal — check ranges directly
    if (isPrivateIP(hostname)) {
      return res.status(400).json({ error: 'Invalid URL: private or loopback IP addresses are not allowed' });
    }
  } else {
    // Hostname — resolve to IPs and check each
    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      for (const addr of addresses) {
        if (isPrivateIP(addr.address)) {
          return res.status(400).json({
            error: `Invalid URL: hostname resolves to a private/internal IP (${addr.address})`,
          });
        }
      }
    } catch {
      return res.status(400).json({ error: 'Invalid URL: could not resolve hostname' });
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'VeilleRSS/1.0' },
      redirect: 'error',
    });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(400).json({ error: `URL returned HTTP ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // Check if response looks like RSS/XML
    if (!text.includes('<rss') && !text.includes('<feed') && !text.includes('<rdf:RDF') && !text.includes('<?xml')) {
      return res.status(400).json({ error: 'URL does not appear to be an RSS/Atom feed' });
    }
  } catch (err) {
    console.error('[Feeds] Fetch error:', err.message);
    return res.status(400).json({ error: 'Failed to validate feed URL' });
  }

  // Insert feed
  const db = getDb();
  try {
    const info = db.prepare('INSERT INTO feeds (url, title, active) VALUES (?, ?, 1)').run(
      url,
      (title || '').trim() || null
    );
    const feed = db.prepare('SELECT id, url, title, active, created_at FROM feeds WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(feed);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Feed URL already exists' });
    }
    console.error('[Feeds] Insert error:', err.message);
    res.status(500).json({ error: 'Failed to add feed' });
  }
});

// DELETE /api/feeds/:id — delete a feed
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid feed ID' });
  }

  const result = db.prepare('DELETE FROM feeds WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Feed not found' });
  }
  res.json({ success: true });
});

module.exports = router;
