const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLang } = require('../languages');
const axios = require('axios');

class WyzieProvider extends BaseProvider {
  constructor() {
    super('wyzie', { enabled: true });
  }

  async search(query) {
    if (!query.imdbId && !query.searchQuery) return { subtitles: [] };
    
    const params = {};
    if (query.imdbId) params.imdb = query.imdbId;
    if (query.searchQuery) params.title = query.searchQuery;

    try {
      const response = await axios.get('https://api.wyziesubs.dev/v1/subs', { params, timeout: 8000 });
      if (!Array.isArray(response.data)) return { subtitles: [] };

      return {
        subtitles: response.data.map(sub => {
          const ext = sub.filename?.split('.').pop()?.toLowerCase() || 'vtt';
          return new SubtitleResult({
            id: `wyzie-${sub.url}`,
            url: sub.url,
            language: normalizeLang(sub.lang),
            source: 'wyzie',
            fileName: sub.filename || "unknown.vtt",
            format: ext === 'ass' ? 'ass' : 'vtt',
            needsConversion: true
          });
        })
      };
    } catch (err) {
      log('warn', `[WyzieProvider] Unavailable or failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = WyzieProvider;