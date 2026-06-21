const axios = require('axios');
const { log } = require('../logger');

async function getCinemetaTitle(imdbId, type) {
  try {
    const metaType = type === 'series' ? 'series' : 'movie';
    const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${metaType}/${imdbId}.json`);
    return response.data?.meta?.name || null;
  } catch (e) {
    log('error', `[Cinemeta] Error: ${e.message}`);
    return null;
  }
}

module.exports = { getCinemetaTitle };