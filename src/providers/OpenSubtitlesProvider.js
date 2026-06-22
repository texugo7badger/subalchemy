const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { OS_BASE, OS_UA, THROTTLE_MS } = require('../constants');
const { normalizeLang } = require('../languages');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

const warpAgent = new SocksProxyAgent('socks5://127.0.0.1:40000');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

/**
 * OpenSubtitles subtitle provider.
 * Uses the legacy REST API at rest.opensubtitles.org via WARP SOCKS proxy
 * to avoid regional blocking. No user API key required — uses the public
 * VLSub 0.10.3 X-User-Agent header. Falls back to the v2 API with token
 * refresh (requires OS_API_KEY env var) on HTTP 401.
 */
class OpenSubtitlesProvider extends BaseProvider {
  constructor() {
    super('opensubtitles', { enabled: true });
    this._lastRequestAt = 0;
    this._authToken = null; // Cached token for the new API (fallback)
  }

  async _throttle() {
    const elapsed = Date.now() - this._lastRequestAt;
    if (elapsed < THROTTLE_MS) {
      await new Promise(resolve => setTimeout(resolve, THROTTLE_MS - elapsed));
    }
    this._lastRequestAt = Date.now();
  }

  /**
   * Attempt to log in to the new OpenSubtitles API and cache the token.
   * Used as fallback when the legacy REST API returns 401.
   * @returns {string|null} JWT token or null
   */
  async _refreshToken() {
    const apiKey = process.env.OS_API_KEY;
    if (!apiKey) {
      log('warn', '[OpenSubtitles] No OS_API_KEY env var set – cannot refresh token.');
      return null;
    }
    try {
      const response = await axios.post('https://api.opensubtitles.com/api/v1/login',
        { username: '', password: '' }, // API key login (empty user/pass)
        {
          headers: {
            'Api-Key': apiKey,
            'User-Agent': UA,
            'Content-Type': 'application/json',
          },
          httpAgent: warpAgent,
          httpsAgent: warpAgent,
          timeout: 10000,
        }
      );
      this._authToken = response.data?.token;
      if (this._authToken) {
        log('info', '[OpenSubtitles] Token refreshed successfully.');
      }
      return this._authToken;
    } catch (err) {
      log('warn', `[OpenSubtitles] Token refresh failed: ${err.message}`);
      return null;
    }
  }

  async search(query) {
    if (!query.imdbId) return { subtitles: [] };

    const numericId = query.imdbId.replace(/^tt/, '');
    let searchPath = `/search/imdbid-${numericId}`;

    if (query.season != null && query.episode != null) {
      searchPath = `/search/episode-${query.episode}/imdbid-${numericId}/season-${query.season}`;
    }

    if (query.languages && query.languages.length === 1) {
      searchPath += `/sublanguageid-${normalizeLang(query.languages[0])}`;
    }

    const url = `${OS_BASE}${searchPath}`;
    log('debug', `[OpenSubtitles] Fetching via WARP: ${url}`);

    await this._throttle();

    try {
      const response = await axios.get(url, {
        httpAgent: warpAgent,
        httpsAgent: warpAgent,
        headers: {
          'X-User-Agent': OS_UA,
          'Accept': 'application/json',
        },
        timeout: 10000,
        validateStatus: status => status < 500, // Don't throw on 4xx — handle below
      });

      // Handle 401: token expired or blocked
      if (response.status === 401) {
        log('warn', '[OpenSubtitles] REST API returned 401 – token expired or blocked.');
        const token = await this._refreshToken();
        if (!token) {
          log('warn', '[OpenSubtitles] Token expired – skipping provider.');
          return { subtitles: [] };
        }
        // Retry with new token via the v2 API
        return this._searchV2(query, token);
      }

      if (!Array.isArray(response.data)) return { subtitles: [] };

      const results = [];
      for (const entry of response.data) {
        const langCode = (entry.ISO639 || 'eng').toLowerCase();

        if (query.languages && query.languages.length > 1) {
          const matches = query.languages.some(l => normalizeLang(l) === langCode);
          if (!matches) continue;
        }

        results.push(new SubtitleResult({
          id: `os-${entry.IDSubtitle || entry.IDSubtitleFile}`,
          url: entry.SubDownloadLink || `https://dl.opensubtitles.org/en/download/file/${entry.IDSubtitleFile}`,
          language: langCode,
          source: 'opensubtitles',
          fileName: entry.SubFileName || '',
          format: (entry.SubFormat || 'srt').toLowerCase(),
          needsConversion: (entry.SubFormat || 'srt').toLowerCase() !== 'srt',
          releaseName: entry.MovieReleaseName || entry.MovieName || '',
        }));
      }

      log('info', `[OpenSubtitles] Found ${results.length} subtitles.`);
      return { subtitles: results };
    } catch (err) {
      log('warn', `[OpenSubtitles] Error: ${err.message}`);
      return { subtitles: [] };
    }
  }

  /**
   * Fallback search using the new OpenSubtitles v2 API with JWT token.
   * @param {object} query - The search query
   * @param {string} token - JWT auth token
   * @returns {object} { subtitles: SubtitleResult[] }
   */
  async _searchV2(query, token) {
    try {
      const params = {
        imdb_id: query.imdbId,
        languages: query.languages?.join(',') || 'en',
      };
      if (query.season) params.season_number = query.season;
      if (query.episode) params.episode_number = query.episode;

      const response = await axios.get('https://api.opensubtitles.com/api/v1/subtitles', {
        params,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Api-Key': process.env.OS_API_KEY || '',
          'User-Agent': UA,
        },
        httpAgent: warpAgent,
        httpsAgent: warpAgent,
        timeout: 10000,
      });

      const data = response.data?.data || [];
      const results = data.map(entry => {
        const attrs = entry.attributes || {};
        return new SubtitleResult({
          id: `os-${entry.id}`,
          url: attrs.files?.[0]?.file_url || attrs.url || '',
          language: (attrs.language || 'en').toLowerCase(),
          source: 'opensubtitles',
          fileName: attrs.files?.[0]?.file_name || attrs.release || '',
          format: (attrs.files?.[0]?.file_name || '').split('.').pop()?.toLowerCase() || 'srt',
          needsConversion: true, // V2 API files may need conversion
          releaseName: attrs.release || '',
        });
      });

      log('info', `[OpenSubtitles] Found ${results.length} subtitles (v2 API).`);
      return { subtitles: results };
    } catch (err) {
      log('warn', `[OpenSubtitles] V2 API search failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = OpenSubtitlesProvider;