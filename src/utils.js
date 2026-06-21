const { STREMIO_UA_RE } = require('./constants');

function parseStremioId(id) {
  if (!id) return {};
  if (id.startsWith('kitsu:')) {
    return { kitsuId: id.split(':')[1] };
  }
  const parts = id.split(':');
  const imdbId = parts[0];
  if (parts.length === 3) {
    return { imdbId, season: parseInt(parts[1], 10), episode: parseInt(parts[2], 10) };
  }
  return { imdbId };
}

function isStremioClient(userAgent) {
  return STREMIO_UA_RE.test(userAgent || '');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { parseStremioId, isStremioClient, sleep };