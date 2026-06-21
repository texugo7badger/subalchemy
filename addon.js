require('dotenv').config();
const express = require('express');
const path = require('path');
const { log } = require('./src/logger');
const routes = require('./src/routes');

const PORT = process.env.PORT || 7000;
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// Serve static UI assets
app.use('/assets', express.static(path.join(__dirname, 'src', 'ui', 'assets')));

// Register Routes
app.use(routes.stremio);
app.use(routes.proxy);
app.use(routes.configure);
app.use(routes.configApi);
app.use(routes.health);

// Fallback 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.listen(PORT, () => {
  log('info', `[SubAlchemy] Server started on port ${PORT}`);
  log('info', `[SubAlchemy] Addon accessible at: ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}/manifest.json`);
});