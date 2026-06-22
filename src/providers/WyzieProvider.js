const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLanguage } = require('../utils/subtitleUtils');
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const WYZIE_API = 'https://sub.wyzie.io/api/v1/subs';

/**
 * Wyzie subtitle provider.
 * Queries the wyzie.io subtitle API.
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

    const params = {};
    if (query.imdbId) params.imdb = query.imdbId;
    if (query.searchQuery) params.title = query.searchQuery;

    try {
      const response = await axios.get(WYZIE_API, {
        params,
        timeout: 8000,
        headers: {
          'x-api-key': apiKey,
          'User-Agent': UA,
          'Accept': 'application/json',
        },
      });

      if (!Array.isArray(response.data)) return { subtitles: [] };

      const subs = response.data.map(sub => {
        const ext = (sub.filename || '').split('.').pop()?.toLowerCase() || 'vtt';
        return new SubtitleResult({
          id: `wyzie-${encodeURIComponent(sub.url || '')}`,
          url: sub.url,
          language: normalizeLanguage(sub.lang) || 'eng',
          source: 'wyzie',
          fileName: sub.filename || 'unknown' + '.' + ext,
          releaseName: sub.release || '',
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