const axios = require('axios');
const { log } = require('../logger');

async function getKitsuTitle(kitsuId) {
  try {
    const response = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`);
    return response.data?.data?.attributes?.canonicalTitle || null;
  } catch (e) {
    log('error', `[Kitsu] Error: ${e.message}`);
    return null;
  }
}

module.exports = { getKitsuTitle };