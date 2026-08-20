const test = require('node:test');
const assert = require('node:assert/strict');
process.env.APP_PASSWORD ||= 'test-password';
process.env.SESSION_SECRET ||= 'test-session-secret';
const { fetchFeed } = require('../src/pipeline/ingest');

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title><item><title>Article</title><link>https://example.com/article</link></item></channel></rss>`;

test('fetchFeed parses a successful RSS response', async () => {
  const feed = await fetchFeed('https://example.com/feed', async (_url, options) => {
    assert.equal(options.headers['User-Agent'].startsWith('VeilleRSS/'), true);
    assert.equal(options.redirect, 'error');
    assert.equal(options.signal instanceof AbortSignal, true);
    return new Response(RSS, { status: 200 });
  });
  assert.equal(feed.title, 'Test');
  assert.equal(feed.items.length, 1);
});

test('fetchFeed rejects an HTTP error', async () => {
  await assert.rejects(
    fetchFeed('https://example.com/feed', async () => new Response('', { status: 403 })),
    /Status code 403/
  );
});

test('fetchFeed preserves timeout errors', async () => {
  const timeout = new Error('Request timed out');
  timeout.name = 'TimeoutError';
  await assert.rejects(
    fetchFeed('https://example.com/feed', async () => { throw timeout; }),
    { name: 'TimeoutError' }
  );
});
