const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLang } = require('../languages');
const axios = require('axios');
const cheerio = require('cheerio');

class NyaaProvider extends BaseProvider {
  constructor() {
    super('nyaa', { enabled: true });
    this.priority = 80; // Alta prioridade para animes
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    try {
      // Busca na categoria 1_2 (Anime - English-translated) que geralmente tem legendas embutidas ou anexadas
      const searchQuery = `${query.searchQuery}`;
      const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(searchQuery)}&c=1_2&f=0`;
      
      const response = await axios.get(url, { 
        timeout: 8000, 
        headers: { 'User-Agent': 'Mozilla/5.0' } 
      });
      
      const $ = cheerio.load(response.data, { xmlMode: true });
      const subs = [];

      // Itera sobre os itens do RSS
      $('item').each((i, el) => {
        const description = $(el).find('description').text();
        const desc$ = cheerio.load(description);
        
        // Procura por links diretos de legenda na descrição
        desc$('a').each((j, a) => {
          const href = desc$(a).attr('href');
          if (href && (href.endsWith('.ass') || href.endsWith('.srt') || href.endsWith('.zip'))) {
            const ext = href.split('.').pop().toLowerCase();
            // Tenta inferir o idioma pelo nome do arquivo
            const fileName = href.split('/').pop().toLowerCase();
            let lang = 'eng';
            if (fileName.includes('por') || fileName.includes('ptbr') || fileName.includes('pt-br') || fileName.includes('pob')) {
              lang = 'pob';
            }
            
            subs.push(new SubtitleResult({
              id: `nyaa-${href}`,
              url: href,
              language: normalizeLang(lang),
              source: 'nyaa',
              fileName: fileName,
              format: ext,
              needsConversion: ext !== 'srt'
            }));
          }
        });
      });

      log('info', `[Nyaa] Found ${subs.length} subtitles.`);
      return { subtitles: subs };
    } catch (err) {
      log('warn', `[Nyaa] Failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = NyaaProvider;