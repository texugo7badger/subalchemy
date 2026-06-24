require('dotenv').config();
const express = require('express');
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

app.use('/assets', express.static(path.join(__dirname, 'src', 'ui', 'assets')));
app.use(express.json());

// Order matters: configure + configApi + health first (static paths),
// then proxy (serves /srt/:subId.srt for converted subs),
// then stremio (manifest + subtitles, dynamic paths).
app.use(routes.configure);
app.use(routes.configApi);
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
