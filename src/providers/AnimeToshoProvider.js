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
      // Usa o novo domínio .xyz com o parâmetro disp=attachments para listar apenas legendas
      const searchQuery = `${query.searchQuery}`;
      const url = `https://animetosho.xyz/search?q=${encodeURIComponent(searchQuery)}&disp=attachments`;
      
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const subs = [];

      // Procura por todos os links <a> na página
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();

        // Filtra apenas os links que terminam com extensões de legenda
        if (href && (href.endsWith('.ass') || href.endsWith('.srt') || href.endsWith('.zip'))) {
          
          // Garante que a URL seja absoluta
          let fullUrl = href;
          if (href.startsWith('/')) {
            fullUrl = `https://animetosho.xyz${href}`;
          }

          const fileName = text || fullUrl.split('/').pop();
          const ext = fileName.split('.').pop().toLowerCase();
          
          // Usa o nome do arquivo para detectar o idioma
          const lang = normalizeLanguage(fileName) || 'eng';

          subs.push(new SubtitleResult({
            id: `atosho-${fullUrl}`,
            url: fullUrl,
            language: lang,
            source: 'animetosho',
            fileName: fileName,
            releaseName: 'AnimeTosho', // Nome genérico para a UI
            format: ext,
            needsConversion: ext !== 'srt'
          }));
        }
      });

      // Remove duplicatas baseadas na URL
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