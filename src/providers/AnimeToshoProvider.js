const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLanguage } = require('../utils/subtitleUtils');
const axios = require('axios');
const cheerio = require('cheerio');

class AnimeToshoProvider extends BaseProvider {
  constructor() {
    super('animetosho', { enabled: true });
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    try {
      const searchQuery = `${query.searchQuery}`;
      const url = `https://animetosho.xyz/search?q=${encodeURIComponent(searchQuery)}`;
      log('debug', `[AnimeTosho] Fetching: ${url}`);
      
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const subs = [];

      // Procura por links de anexos de legenda
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();

        // Filtra links que contêm /subs/file/ (padrão do AnimeTosho) ou terminam com extensões
        if (href && (href.includes('/subs/file/') || href.endsWith('.ass') || href.endsWith('.srt') || href.endsWith('.zip'))) {
          
          let fullUrl = href;
          if (href.startsWith('/')) {
            fullUrl = `https://animetosho.xyz${href}`;
          }

          // Tenta pegar o nome do release no elemento pai
          const releaseName = $(el).closest('.home_list_entry, .search_result, div').find('.link, .title').first().text().trim() || text;
          
          let ext = 'ass';
          if (fullUrl.endsWith('.srt') || text.endsWith('.srt')) ext = 'srt';
          else if (fullUrl.endsWith('.zip') || text.endsWith('.zip')) ext = 'zip';

          // O texto do link geralmente contém o idioma, ex: "Portuguese.ass" ou "POR-BR.ass"
          const langSource = text + ' ' + releaseName;
          let lang = normalizeLanguage(langSource) || 'eng';
          
          subs.push(new SubtitleResult({
            id: `atosho-${fullUrl}`,
            url: fullUrl,
            language: lang,
            source: 'animetosho',
            fileName: text || releaseName,
            releaseName: releaseName,
            format: ext,
            needsConversion: ext !== 'srt'
          }));
        }
      });

      // Remove duplicatas
      const uniqueSubs = [];
      const seenUrls = new Set();
      for (const sub of subs) {
        if (!seenUrls.has(sub.url)) {
          seenUrls.add(sub.url);
          uniqueSubs.push(sub);
        }
      }

      log('info', `[AnimeTosho] Found ${uniqueSubs.length} subtitles.`);
      return { subtitles: uniqueSubs };
    } catch (err) {
      log('error', `[AnimeTosho] Failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = AnimeToshoProvider;