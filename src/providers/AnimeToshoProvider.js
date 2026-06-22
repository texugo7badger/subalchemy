const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLanguage } = require('../languages');
const axios = require('axios');

class AnimeToshoProvider extends BaseProvider {
  constructor() {
    super('animetosho', { enabled: true });
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    try {
      // Busca no AnimeTosho focada em animes com Multi-Subs
      const searchQuery = `${query.searchQuery} Multi-Subs`;
      const response = await axios.get('https://animetosho.org/search/api', {
        params: { q: searchQuery },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000
      });

      const subs = [];
      if (Array.isArray(response.data)) {
        response.data.forEach(entry => {
          if (entry.attachments) {
            entry.attachments.forEach(att => {
              if (att.type === 'subtitle') {
                const ext = att.name?.split('.').pop()?.toLowerCase() || 'ass';
                subs.push(new SubtitleResult({
                  id: `atosho-${att.link}`,
                  url: att.link,
                  language: normalizeLanguage(att.lang || 'eng'),
                  source: 'animetosho',
                  fileName: att.name || "unknown.ass",
                  releaseName: entry.title || '',
                  format: ext,
                  needsConversion: ext !== 'srt'
                }));
              }
            });
          }
        });
      }
      log('info', `[AnimeTosho] Found ${subs.length} subtitles.`);
      return { subtitles: subs };
    } catch (err) {
      log('error', `[AnimeTosho] Failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = AnimeToshoProvider;