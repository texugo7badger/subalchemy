const express = require('express');
const { generateManifest } = require('../../manifest');
const { handleSubtitlesRequest } = require('../handlers/subtitles');
const { registerDefaultProviders } = require('../providers');
const { log } = require('../logger');

registerDefaultProviders();

const router = express.Router();

// Manifest com Query Params (ex: /manifest.json?subdlApiKey=123)
router.get('/manifest.json', (req, res) => {
  const config = req.query;
  res.setHeader('Cache-Control', 'max-age=86400, public');
  res.json(generateManifest(config));
});

// Rota de Legendas (Stremio envia os query params aqui automaticamente)
router.get('/subtitles/:type/:id/:extra?.json', async (req, res) => {
  try {
    const config = req.query;
    config._userAgent = req.headers['user-agent'] || '';
    
    const args = {
      type: req.params.type,
      id: req.params.id,
      extra: req.params.extra
    };
    
    const result = await handleSubtitlesRequest(args, config);
    res.json(result);
  } catch (err) {
    log('error', `[StremioRoute] Subtitles error: ${err.message}`);
    res.json({ subtitles: [] });
  }
});

module.exports = router;