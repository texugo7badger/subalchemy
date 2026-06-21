const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLang } = require('../languages');
const axios = require('axios');
const cheerio = require('cheerio');

class NekoBTProvider extends BaseProvider {
  constructor() {
    super('nekobt', { enabled: true });
    this.priority = 75; 
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    try {
      // O NekoBT não tem um RSS tão amigável quanto o Nyaa, então usamos a busca HTML
      const searchQuery = `${query.searchQuery}`;
      const url = `https://nekobt.net/?s=${encodeURIComponent(searchQuery)}`;
      
      const response = await axios.get(url, { 
        timeout: 8000, 
        headers: { 'User-Agent': 'Mozilla/5.0' } 
      });
      
      const $ = cheerio.load(response.data);
      const subs = [];

      // O NekoBT geralmente lista os torrents. Procuramos por links de anexos na página.
      // Nota: A estrutura do NekoBT pode mudar, então buscamos de forma genérica por links de legendas.
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && (href.endsWith('.ass') || href.endsWith('.srt') || href.endsWith('.zip'))) {
          const ext = href.split('.').pop().toLowerCase();
          const fileName = href.split('/').pop().toLowerCase();
          let lang = 'eng';
          if (fileName.includes('por') || fileName.includes('ptbr') || fileName.includes('pt-br') || fileName.includes('pob')) {
            lang = 'pob';
          }
          
          subs.push(new SubtitleResult({
            id: `nekobt-${href}`,
            url: href,
            language: normalizeLang(lang),
            source: 'nekobt',
            fileName: fileName,
            format: ext,
            needsConversion: ext !== 'srt'
          }));
        }
      });

      log('info', `[NekoBT] Found ${subs.length} subtitles.`);
      return { subtitles: subs };
    } catch (err) {
      log('warn', `[NekoBT] Failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = NekoBTProvider;