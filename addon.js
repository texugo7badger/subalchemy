require('dotenv').config();
const express = require('express');
const path = require('path');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const { generateManifest } = require('./manifest');
const { handleSubtitlesRequest } = require('./src/handlers/subtitles');
const routes = require('./src/routes');
const { log } = require('./src/logger');

const PORT = process.env.PORT || 7000;
const app = express();

const builder = new addonBuilder(generateManifest({}));

builder.defineSubtitlesHandler(async ({ id, type, config }) => {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  return await handleSubtitlesRequest({ id, type }, config, baseUrl);
});

const stremioRouter = getRouter(builder.getInterface());

app.use('/assets', express.static(path.join(__dirname, 'src', 'ui', 'assets')));
app.use(express.json());

app.use(routes.configure);
app.use(routes.configApi);
app.use(routes.health);
app.use(routes.proxy);   // Serves converted SRT files at /srt/:subId.srt — required by Tizen 9
app.use(stremioRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.listen(PORT, () => {
  log('info', `[SubAlchemy] Server started on port ${PORT}`);
  log('info', `[SubAlchemy] Addon accessible at: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/manifest.json`);
});