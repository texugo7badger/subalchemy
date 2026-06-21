const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLang } = require('../languages');
const axios = require('axios');

class EraiRawsProvider extends BaseProvider {
  constructor() {
    super('erairaws', { enabled: true });
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    // Busca especificamente por releases do erai-raws no AnimeTosho
    const searchQuery = `${query.searchQuery} erai-raws`;
    
    try {
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
                  id: `erai-${att.link}`,
                  url: att.link,
                  language: normalizeLang(att.lang || 'eng'),
                  source: 'erai-raws',
                  fileName: att.name || "unknown.ass",
                  format: ext,
                  needsConversion: ext !== 'srt'
                }));
              }
            });
          }
        });
      }
      log('info', `[EraiRaws] Found ${subs.length} subtitles.`);
      return { subtitles: subs };
    } catch (err) {
      log('error', `[EraiRaws] Failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = EraiRawsProvider;