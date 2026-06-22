const express = require('express');
const subtitleStore = require('../cache/SubtitleStore');
const { log } = require('../logger');
const router = express.Router();

/**
 * Serve a converted SRT subtitle by its id.
 *
 * Stremio (and especially Samsung Tizen 9's native player) requires:
 *   - Content-Type: application/x-subrip (or text/srt)
 *   - charset=utf-8 (otherwise accents in PT-BR/ES break)
 *   - Access-Control-Allow-Origin: * (CORS — Stremio runs the player in
 *     a sandboxed context that fetches subs cross-origin)
 *   - Access-Control-Allow-Methods + Access-Control-Allow-Headers for
 *     preflight requests (some Tizen firmware does an OPTIONS preflight)
 *   - Cache-Control: public, max-age=31536000, immutable — the subId is
 *     an md5 hash of the source URL, so the content never changes
 *   - Content-Disposition: attachment; filename="<id>.srt" — some Tizen
 *     builds refuse to load a subtitle without an explicit filename
 *   - X-Content-Type-Options: nosniff — prevents some smart-TV browsers
 *     from trying to sniff the content as HTML
 *
 * Without all of these, Tizen 9 shows "Failed to load external subtitle"
 * even when the content is valid SRT.
 */
router.get('/srt/:subId', (req, res) => {
  const subId = req.params.subId.replace(/\.srt$/i, '');
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

  res.send(cachedSub.content);
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