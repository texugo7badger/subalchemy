const express = require('express');
const { generateManifest } = require('../../manifest');
const { handleSubtitlesRequest } = require('../handlers/subtitles');
const { registerDefaultProviders } = require('../providers');
const { log } = require('../logger');
const { parseConfigParam } = require('../config');

registerDefaultProviders();
const router = express.Router();

function setStremioHeaders(res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'max-age=86400, public');
}

// Rota raiz (Stremio acessa aqui quando não tem config. Exige configuração)
router.get('/manifest.json', (req, res) => {
  setStremioHeaders(res);
  const manifest = generateManifest({});
  manifest.behaviorHints.configurationRequired = true;
  res.json(manifest);
});

// Rota COM configuração (Stremio acessa aqui depois de instalar)
router.get('/:config/manifest.json', (req, res) => {
  const { config } = parseConfigParam(req.params.config);
  const manifest = generateManifest(config);
  
  // Se tem config, não é mais necessário configurar!
  if (config && Object.keys(config).length > 0) {
    delete manifest.behaviorHints.configurationRequired;
  }
  
  setStremioHeaders(res);
  res.json(manifest);
});

// Rota de Legendas COM configuração
router.get('/:config/subtitles/:type/:id/:extra?.json', async (req, res) => {
  setStremioHeaders(res);
  try {
    const { config } = parseConfigParam(req.params.config);
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