const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLang } = require('../languages');
const axios = require('axios');

const API_BASE = 'https://api.subsource.net/api/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

// SubSource API rate limit: 60 req/min per key. We space requests by 1.1s to stay safe.
const THROTTLE_MS = 1100;

/**
 * SubSource subtitle provider.
 * Queries the v1 REST API at api.subsource.net using the user's API key.
 *
 * Auth: API key is sent as the `X-API-Key` header on JSON endpoints and as
 * `api_key` query param on the binary download endpoint (so convertToSrt can
 * fetch the ZIP without custom headers).
 *
 * Flow:
 *   1. Resolve movieId via /movies/search (by imdbId or text)
 *   2. List subtitles via /subtitles?movieId=...
 *   3. Each SubtitleResult.url points to /subtitles/{id}/download?api_key=...
 *      (returns a ZIP stream; the existing zipExtract converter handles it)
 */
class SubsourceProvider extends BaseProvider {
  constructor() {
    super('subsource', { enabled: true });
    this._lastRequestAt = 0;
  }

  async _throttle() {
    const elapsed = Date.now() - this._lastRequestAt;
    if (elapsed < THROTTLE_MS) {
      await new Promise(resolve => setTimeout(resolve, THROTTLE_MS - elapsed));
    }
    this._lastRequestAt = Date.now();
  }

  /**
   * Build the standard headers for JSON endpoints.
   * @param {string} apiKey - SubSource API key
   * @returns {object} Axios headers
   */
  _jsonHeaders(apiKey) {
    return {
      'X-API-Key': apiKey,
      'User-Agent': UA,
      'Accept': 'application/json',
    };
  }

  /**
   * Resolve a SubSource movieId from the search query.
   * Prefers IMDB id (more precise); falls back to text search by title.
   * @param {object} query - The search query
   * @param {string} apiKey - SubSource API key
   * @returns {Promise<number|null>} movieId or null if not found
   */
  async _resolveMovieId(query, apiKey) {
    let url;
    if (query.imdbId) {
      url = `${API_BASE}/movies/search?searchType=imdb&imdb=${encodeURIComponent(query.imdbId)}`;
    } else if (query.searchQuery) {
      url = `${API_BASE}/movies/search?searchType=text&q=${encodeURIComponent(query.searchQuery)}`;
    } else {
      return null;
    }

    // Season filter applies to both imdb and text search (series)
    if (query.season != null) {
      url += `&season=${encodeURIComponent(query.season)}`;
    }

    log('debug', `[SubSource] Resolving movieId: ${url.replace(/api_key=[^&]+/, 'api_key=***')}`);

    await this._throttle();
    const res = await axios.get(url, {
      headers: this._jsonHeaders(apiKey),
      timeout: 8000,
      validateStatus: status => status < 500, // Don't throw on 4xx — handle below
    });

    if (res.status === 401) {
      log('warn', '[SubSource] API key rejected (401).');
      return null;
    }
    if (res.status !== 200 || !res.data?.success || !Array.isArray(res.data.data)) {
      log('warn', `[SubSource] Movie search returned status ${res.status}.`);
      return null;
    }
    if (res.data.data.length === 0) {
      log('info', '[SubSource] No matching title found.');
      return null;
    }

    const movieId = res.data.data[0].movieId;
    log('debug', `[SubSource] Resolved movieId=${movieId} ("${res.data.data[0].title}").`);
    return movieId;
  }

  /**
   * Search subtitles for the given query.
   * @param {object} query - Search query object
   * @returns {Promise<{subtitles: SubtitleResult[]}>}
   */
  async search(query) {
    const apiKey = query.apiKeys?.subsourceApiKey;
    if (!apiKey) {
      log('warn', '[SubSource] No API key configured – skipping provider.');
      return { subtitles: [] };
    }
    if (!query.imdbId && !query.searchQuery) return { subtitles: [] };

    try {
      const movieId = await this._resolveMovieId(query, apiKey);
      if (!movieId) return { subtitles: [] };

      // List subtitles for this movieId. We don't filter by language here —
      // the request handler filters by requested languages after aggregation.
      // Sort by popular to surface the highest-quality subs first; limit 100
      // to stay within one page (avoids extra throttled requests).
      const listUrl = `${API_BASE}/subtitles?movieId=${movieId}&limit=100&sort=popular`;
      log('debug', `[SubSource] Listing subtitles for movieId=${movieId}.`);

      await this._throttle();
      const res = await axios.get(listUrl, {
        headers: this._jsonHeaders(apiKey),
        timeout: 8000,
        validateStatus: status => status < 500,
      });

      if (res.status === 401) {
        log('warn', '[SubSource] API key rejected (401) on subtitle list.');
        return { subtitles: [] };
      }
      if (res.status !== 200 || !res.data?.success || !Array.isArray(res.data.data)) {
        log('warn', `[SubSource] Subtitle list returned status ${res.status}.`);
        return { subtitles: [] };
      }

      const subs = res.data.data.map(entry => {
        // releaseInfo is an array like ["BluRay","1080p"]
        const releaseInfo = Array.isArray(entry.releaseInfo)
          ? entry.releaseInfo.join(' ')
          : (entry.releaseInfo || '');
        const releaseName = releaseInfo || entry.releaseType || `subsource-${entry.subtitleId}`;

        // Build self-contained download URL. SubSource accepts api_key as
        // query param on the /download endpoint, so convertToSrt can fetch
        // the ZIP without custom headers.
        const downloadUrl = `${API_BASE}/subtitles/${entry.subtitleId}/download?api_key=${encodeURIComponent(apiKey)}`;

        return new SubtitleResult({
          id: `subsource-${entry.subtitleId}`,
          url: downloadUrl,
          language: normalizeLang(entry.language) || 'eng',
          source: 'subsource',
          fileName: `subsource-${entry.subtitleId}.zip`,
          format: 'zip',
          needsConversion: true, // ZIP → extractSrtFromZip() in convertToSrt
          releaseName,
        });
      });

      log('info', `[SubSource] Found ${subs.length} subtitles.`);
      return { subtitles: subs };
    } catch (err) {
      log('warn', `[SubSource] Error: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = SubsourceProvider;