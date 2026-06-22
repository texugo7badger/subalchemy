const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLanguage } = require('../utils/subtitleUtils');
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const WYZIE_API = 'https://sub.wyzie.io/search';

/**
 * Wyzie subtitle provider.
 *
 * Queries the Wyzie subtitle API. Auth is via the `key` query parameter
 * (NOT a header — the server ignores `x-api-key` and `Authorization`).
 * The key is sent as `?key=<userKey>` on every request.
 *
 * Endpoint: https://sub.wyzie.io/search?id=<imdbId>&key=<apiKey>
 *   - `id` accepts IMDB (tt...) or TMDB ids
 *   - `season` + `episode` for TV
 *   - `language` (ISO 639-1, comma-separated) optional
 *
 * Response: JSON array of subtitle objects with fields:
 *   { url, language, format, source, release, name, file, ... }
 */
class WyzieProvider extends BaseProvider {
  constructor() {
    super('wyzie', { enabled: true });
  }

  async search(query) {
    if (!query.imdbId && !query.searchQuery) return { subtitles: [] };

    const apiKey = query.apiKeys?.wyzieApiKey;
    if (!apiKey) {
      log('warn', '[Wyzie] No API key configured – skipping provider.');
      return { subtitles: [] };
    }

    // Build query params. Wyzie uses `id` (not `imdb`) and accepts both
    // IMDB (tt...) and TMDB ids. For text search we use `id` with the title
    // (Wyzie falls back to text matching when the value isn't a tt/TMDB id).
    const params = { key: apiKey };
    if (query.imdbId) {
      params.id = query.imdbId;
    } else if (query.searchQuery) {
      params.id = query.searchQuery;
    }
    if (query.season != null) params.season = query.season;
    if (query.episode != null) params.episode = query.episode;

    try {
      const response = await axios.get(WYZIE_API, {
        params,
        timeout: 8000,
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
        },
        // Don't throw on 4xx — we want to log the actual error message
        validateStatus: status => status < 500,
      });

      // 401 = no `key` param seen (shouldn't happen — we always send it)
      // 403 = invalid/expired key
      // 429 = rate limit exceeded (free tier = 1000 req/day UTC)
      if (response.status === 401) {
        log('warn', '[Wyzie] API returned 401 — key not recognised. Check that your key is still valid.');
        return { subtitles: [] };
      }
      if (response.status === 403) {
        log('warn', '[Wyzie] API returned 403 — invalid or expired API key.');
        return { subtitles: [] };
      }
      if (response.status === 429) {
        log('warn', '[Wyzie] API returned 429 — daily rate limit exceeded (free tier: 1000 req/day UTC).');
        return { subtitles: [] };
      }
      if (response.status !== 200) {
        log('warn', `[Wyzie] API returned status ${response.status}: ${response.data?.message || 'unknown error'}`);
        return { subtitles: [] };
      }

      if (!Array.isArray(response.data)) {
        log('warn', `[Wyzie] Unexpected response shape (not an array): ${typeof response.data}`);
        return { subtitles: [] };
      }

      const subs = response.data.map(sub => {
        // Wyzie returns `language` as a capitalized name (e.g. "English",
        // "Portuguese (Brazil)"). Normalise to ISO 639-2/B via our utils.
        const langRaw = sub.lang || sub.language || sub.locale || '';
        const ext = (sub.format || sub.file || sub.filename || 'vtt')
          .split('.').pop().toLowerCase() || 'vtt';
        return new SubtitleResult({
          id: `wyzie-${encodeURIComponent(sub.url || sub.id || '')}`,
          url: sub.url,
          language: normalizeLanguage(langRaw) || 'eng',
          source: 'wyzie',
          fileName: sub.file || sub.filename || sub.name || ('unknown.' + ext),
          releaseName: sub.release || sub.name || '',
          format: ext,
          needsConversion: ext !== 'srt',
        });
      });

      log('info', `[Wyzie] Found ${subs.length} subtitles.`);
      return { subtitles: subs };
    } catch (err) {
      log('warn', `[Wyzie] Error: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = WyzieProvider;