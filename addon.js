require('dotenv').config();
const express = require('express');
const compression = require('compression');  // v2.4.5: gzip for /srt/ + /configure
const cookieParser = require('cookie-parser');  // v2.4.5: read subalchemy_uid cookie for /configure restore
const path = require('path');
const { generateManifest } = require('./manifest');
const { handleSubtitlesRequest } = require('./src/handlers/subtitles');
const routes = require('./src/routes');
const { log } = require('./src/logger');

const PORT = process.env.PORT || 7000;
const app = express();

// IMPORTANT: We do NOT use the stremio-addon-sdk getRouter() here.
// The SDK router registers /:config?/:resource(subtitles)/:type/:id/:extra?.json
// which would shadow our custom /:config/subtitles/:type/:id.json route in
// src/routes/stremio.js. The SDK router also doesn't know how to decode our
// base64-encoded config (it passes `config: false` to the handler), which
// silently drops all user API keys. We use our own Express routers instead,
// which call parseConfigParam() to decode the base64 JSON config properly.
//
// The SDK is still imported by other modules (manifest.js, etc.) but the
// HTTP layer is entirely our own Express app below.

// v2.4.5: Enable gzip compression for ALL routes. The biggest win is on
// /srt/:subId.srt (SRT is plain text → compresses ~70%), which directly
// reduces outbound bandwidth. /configure HTML and /assets/*.js also benefit.
// The middleware auto-skips small responses (<1KB) and already-compressed
// content-types, so there's no penalty for tiny JSON responses.
app.use(compression({
  level: 6,             // sane default; 9 is marginal gain at ~2x CPU
  threshold: 1024,      // only compress responses >1KB
  filter: (req, res) => {
    // Don't compress if the client doesn't accept it
    if (req.headers['accept-encoding']?.includes('gzip') === false) return false;
    // Always compress text/* (SRT, HTML, CSS, JS)
    const type = res.getHeader('Content-Type') || '';
    if (/text\/|application\/x-subrip|application\/json|javascript/i.test(type)) return true;
    // Fall back to compression's default heuristic
    return compression.filter(req, res);
  },
}));

// v2.4.5: cookie-parser so routes/configure.js can read/write the
// subalchemy_uid cookie that keys the UserConfigStore. Required for the
// "Configure button in Stremio restores previous config" fix.
app.use(cookieParser());

app.use('/assets', express.static(path.join(__dirname, 'src', 'ui', 'assets')));
app.use(express.json());

// Order matters: configure + configApi + configRestore + health first
// (static paths), then proxy (serves /srt/:subId.srt for converted subs),
// then stremio (manifest + subtitles, dynamic paths).
app.use(routes.configure);
app.use(routes.configApi);
app.use(routes.configRestore);  // v2.4.5: /api/config/restore + /api/config/save
app.use(routes.health);
app.use(routes.proxy);
app.use(routes.stremio);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.listen(PORT, () => {
  const publicUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  log('info', `[SubAlchemy] Server started on port ${PORT}`);
  log('info', `[SubAlchemy] Addon accessible at: ${publicUrl}/manifest.json`);
});
