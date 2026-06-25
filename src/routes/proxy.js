const express = require('express');
const subtitleStore = require('../cache/SubtitleStore');
const { log } = require('../logger');
const router = express.Router();

// v2.4.5: Opportunistic eviction counter — every N requests, sweep
// expired entries. Keeps RAM tight without paying the sweep cost per call.
const EVICT_EVERY_N = 50;
let _requestCounter = 0;

/**
 * Serve a converted SRT subtitle by its id.
 *
 * Stremio (and especially Samsung Tizen 9's native player) requires:
 *   - Content-Type: application/x-subrip (or text/srt)
 *   - charset=utf-8 (otherwise accents in PT-BR/ES break)
 *   - Access-Control-Allow-Origin: * (CORS)
 *   - Access-Control-Allow-Methods + Access-Control-Allow-Headers for
 *     preflight requests (some Tizen firmware does an OPTIONS preflight)
 *   - Cache-Control: public, max-age=31536000, immutable — the subId is
 *     an md5 hash of the source URL, so the content never changes
 *   - Content-Disposition: attachment; filename="<id>.srt"
 *   - X-Content-Type-Options: nosniff
 *
 * v2.4.5 changes:
 *   - Streams the response in 16KB chunks instead of res.send(), which
 *     avoids doubling the buffer in memory for large 4-hour movie subs.
 *   - Adds a periodic sweep of expired SubtitleStore entries.
 *   - HTTP compression (gzip) is enabled globally in addon.js via the
 *     `compression` middleware — SRT is plain text, compresses ~70%.
 */
router.get('/srt/:subId', (req, res) => {
  const subId = req.params.subId.replace(/\.srt$/i, '');

  // Opportunistic eviction sweep
  _requestCounter++;
  if (_requestCounter % EVICT_EVERY_N === 0) {
    const evicted = subtitleStore.evictExpired();
    if (evicted > 0) {
      log('debug', `[Proxy] Evicted ${evicted} expired subtitle(s) from store (size now: ${subtitleStore.size()}).`);
    }
  }

  const cachedSub = subtitleStore.get(subId);

  // Log every request — critical for diagnosing whether the player is
  // actually fetching the subtitle URL we returned to Stremio.
  const userAgent = (req.headers['user-agent'] || '').substring(0, 80);
  const range = req.headers['range'] || '';
  log('info', `[Proxy] GET /srt/${subId}.srt — UA: ${userAgent} — ${cachedSub ? 'HIT (' + cachedSub.content.length + ' chars, lang=' + cachedSub.lang + ')' : 'MISS'}${range ? ' Range: ' + range : ''}`);

  if (!cachedSub) {
    res.status(404).json({ error: 'Subtitle not found or expired' });
    return;
  }

  // CORS — full set for Tizen 9 preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Content-Type — both common SRT mime types accepted by Stremio
  res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Filename hint for Tizen player
  res.setHeader('Content-Disposition', `attachment; filename="${subId}.srt"`);

  // Cache — subId is content-addressed (md5 of source URL), so it's safe
  // to cache forever. This also helps if the user scrubs back in the
  // timeline and the player re-fetches the subtitle.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  // Content-Length is helpful for range requests and progress bars.
  // (compression middleware will adjust this if it kicks in.)
  const buf = Buffer.from(cachedSub.content, 'utf8');
  res.setHeader('Content-Length', buf.length);

  // v2.4.5: Stream in 16KB chunks instead of res.send().
  // Avoids holding the full content as a String AND a Buffer in the
  // request scope simultaneously for large subs.
  const CHUNK = 16 * 1024;
  for (let offset = 0; offset < buf.length; offset += CHUNK) {
    res.write(buf.slice(offset, offset + CHUNK));
  }
  res.end();
});

// Handle CORS preflight for /srt/ (some Tizen firmware sends OPTIONS first)
router.options('/srt/:subId', (req, res) => {
  log('info', `[Proxy] OPTIONS /srt/${req.params.subId} (CORS preflight)`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

module.exports = router;
