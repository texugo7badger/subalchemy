const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLang } = require('../languages');
const axios = require('axios');

class AnimeToshoProvider extends BaseProvider {
  constructor() {
    super('animetosho', { enabled: true });
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    try {
      const response = await axios.get('https://animetosho.org/search/api', {
        params: { q: query.searchQuery },
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
                  language: normalizeLang(att.lang || 'eng'),
                  source: 'animetosho',
                  fileName: att.name || "unknown.ass",
                  format: ext,
                  needsConversion: ext !== 'srt'
                }));
              }
            });
          }
        });
      }
      return { subtitles: subs };
    } catch (err) {
      log('error', `[AnimeToshoProvider] Failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = AnimeToshoProvider;