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

router.get('/manifest.json', (req, res) => {
  setStremioHeaders(res);
  const manifest = generateManifest({});
  manifest.behaviorHints.configurationRequired = true;
  res.json(manifest);
});

router.get('/:config/manifest.json', (req, res) => {
  const { config } = parseConfigParam(req.params.config);
  const manifest = generateManifest(config);
  
  if (config && Object.keys(config).length > 0) {
    delete manifest.behaviorHints.configurationRequired;
  }
  
  setStremioHeaders(res);
  res.json(manifest);
});

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
    
    // CORREÇÃO: Pega a URL base dinamicamente da requisição
    const baseUrl = `${req.protocol}://${req.get('host')}`;
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