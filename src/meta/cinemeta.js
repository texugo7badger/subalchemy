const axios = require('axios');
const { log } = require('../logger');

/**
 * Fetch the title name for a Stremio IMDB id (backward-compat shim).
 * @param {string} imdbId
 * @param {string} type
 * @returns {Promise<string|null>}
 */
async function getCinemetaTitle(imdbId, type) {
  const meta = await getCinemetaMeta(imdbId, type);
  return meta?.name || null;
}

/**
 * v2.4.5: Fetch BOTH the title name and the runtime from Cinemeta.
 *
 * Runtime is used by the subtitles handler to score subtitle sync quality
 * (subs much shorter than the expected runtime are likely cut/cropped
 * releases). Cinemeta exposes this as `meta.runtime` (in minutes for
 * movies, often null for series — we normalize to minutes always).
 *
 * Returns { name, runtime } where runtime is in MINUTES (or null).
 *
 * @param {string} imdbId
 * @param {string} type
 * @returns {Promise<{name: string|null, runtime: number|null}|null>}
 */
async function getCinemetaMeta(imdbId, type) {
  try {
    const metaType = type === 'series' ? 'series' : 'movie';
    const response = await axios.get(`https://v3-cinemeta.strem.io/meta/${metaType}/${imdbId}.json`);
    const meta = response.data?.meta;
    if (!meta) return null;
    let runtime = null;
    if (meta.runtime) {
      const parsed = parseInt(meta.runtime, 10);
      if (Number.isFinite(parsed) && parsed > 0) runtime = parsed;
    }
    return { name: meta.name || null, runtime };
  } catch (e) {
    log('error', `[Cinemeta] Error: ${e.message}`);
    return null;
  }
}

module.exports = { getCinemetaTitle, getCinemetaMeta };
