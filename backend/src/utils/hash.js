const crypto = require('crypto');

/**
 * Canonicalize a URL and return its SHA-256 hash.
 * - Lowercases protocol and hostname
 * - Removes trailing slash from path
 * - Strips common tracking query params
 * - Sorts remaining query params alphabetically
 */
function canonicalUrlHash(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    // Lowercase protocol + host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove trailing slash on path (keep root "/")
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Strip tracking params
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ref', 'source', 'mc_cid', 'mc_eid',
    ];
    const cleanParams = new URLSearchParams();
    for (const [key, value] of parsed.searchParams) {
      if (!trackingParams.includes(key.toLowerCase())) {
        cleanParams.append(key, value);
      }
    }
    // Sort params
    cleanParams.sort();
    parsed.search = cleanParams.toString();

    // Reconstruct without hash
    const canonical = parsed.origin + parsed.pathname + (parsed.search ? '?' + parsed.search : '');

    return crypto.createHash('sha256').update(canonical).digest('hex');
  } catch {
    // If URL parsing fails, hash the raw string
    return crypto.createHash('sha256').update(url).digest('hex');
  }
}

module.exports = { canonicalUrlHash };
