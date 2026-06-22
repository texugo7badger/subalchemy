const express = require('express');
const { generateManifest } = require('../../manifest');
const { handleSubtitlesRequest } = require('../handlers/subtitles');
const { registerDefaultProviders } = require('../providers');
const { log } = require('../logger');
const { parseConfigParam } = require('../config');

registerDefaultProviders();
const router = express.Router();

function setStremioHeaders(res, opts = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Manifest: short cache so Stremio picks up config changes (behaviorHints,
  // logo, etc.) quickly. Subtitles: 60s cache is fine since /srt/:id is
  // immutable per id.
  if (opts.manifest) {
    res.setHeader('Cache-Control', 'max-age=60, public, must-revalidate');
  } else {
    res.setHeader('Cache-Control', 'max-age=60, public');
  }
}

/**
 * Plain /manifest.json — no config yet. Addon is in "configurationRequired"
 * state. Stremio shows the addon but won't request subtitles until the user
 * installs with a config.
 */
router.get('/manifest.json', (req, res) => {
  setStremioHeaders(res, { manifest: true });
  const manifest = generateManifest({});
  res.json(manifest);
});

/**
 * /:config/manifest.json — addon installed with user config.
 *
 * When the user has provided any config (API keys or languages), we clear
 * `configurationRequired` so Stremio starts requesting subtitles. The
 * `configurable: true` flag stays so the user can still click "Configure"
 * in Stremio to edit their keys/languages later.
 */
router.get('/:config/manifest.json', (req, res) => {
  setStremioHeaders(res, { manifest: true });
  const { config } = parseConfigParam(req.params.config);
  const manifest = generateManifest(config);
  res.json(manifest);
});

/**
 * Subtitles handler — Stremio calls this when the user opens a stream.
 *
 * Path patterns (both supported by Stremio):
 *   /:config/subtitles/:type/:id.json
 *   /:config/subtitles/:type/:id/:extra.json
 */
const subtitlesHandler = async (req, res) => {
  setStremioHeaders(res);
  try {
    const { config } = parseConfigParam(req.params.config);
    config._userAgent = req.headers['user-agent'] || '';

    const args = {
      type: req.params.type,
      id: req.params.id,
      extra: req.params.extra || ''
    };

    // Compute baseUrl — prefer RENDER_EXTERNAL_URL (always HTTPS on Render)
    // because req.protocol can be 'http' when behind Render's reverse proxy
    // even though the public URL is HTTPS. Returning an HTTP URL to Stremio
    // causes the player (especially Tizen 9) to receive a 301 redirect that
    // some firmwares silently fail to follow, resulting in the subtitle
    // never appearing on screen even though it was generated successfully.
    let baseUrl;
    if (process.env.RENDER_EXTERNAL_URL) {
      // RENDER_EXTERNAL_URL is just the host (no protocol) on Render
      baseUrl = `https://${process.env.RENDER_EXTERNAL_URL}`;
    } else {
      baseUrl = `${req.protocol}://${req.get('host')}`;
    }
    log('debug', `[StremioRoute] baseUrl for /srt/ URLs: ${baseUrl}`);

    const result = await handleSubtitlesRequest(args, config, baseUrl);
    res.json(result);
  } catch (err) {
    log('error', `[StremioRoute] Subtitles error: ${err.message}`);
    res.json({ subtitles: [] });
  }
};

router.get('/:config/subtitles/:type/:id.json', subtitlesHandler);
router.get('/:config/subtitles/:type/:id/:extra.json', subtitlesHandler);

module.exports = router;