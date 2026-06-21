const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { extractSubsFromMagnet, normalizeLang } = require('../utils/subtitleUtils');
const subtitleStore = require('../cache/SubtitleStore');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

class NyaaProvider extends BaseProvider {
  constructor() {
    super('nyaa', { enabled: true });
    this.priority = 80;
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    try {
      const searchQuery = `${query.searchQuery}`;
      const url = `https://nyaa.si/?q=${encodeURIComponent(searchQuery)}&c=1_2&f=0`;
      
      const response = await axios.get(url, { 
        timeout: 8000, 
        headers: { 'User-Agent': 'Mozilla/5.0' } 
      });
      
      const $ = cheerio.load(response.data);
      const torrents = [];

      // Pega os primeiros 5 resultados para não sobrecarregar
      $('tr.default, tr.success').slice(0, 5).each((i, el) => {
        const title = $(el).find('.torrent-list-link').text().trim();
        const magnet = $(el).find('a[href^="magnet:?"]').attr('href');
        if (magnet && (title.toLowerCase().includes('erai-raws') || title.toLowerCase().includes('subsplease'))) {
          torrents.push({ title, magnet });
        }
      });

      const allSubs = [];
      for (const torrent of torrents) {
        log('info', `[Nyaa] Extracting subs from: ${torrent.title}`);
        const extractedSubs = await extractSubsFromMagnet(torrent.magnet);
        
        for (const sub of extractedSubs) {
          const subId = crypto.createHash('md5').update(torrent.magnet + sub.fileName).digest('hex').slice(0, 20);
          subtitleStore.set(subId, { content: sub.content, lang: sub.language || 'eng' });
          
          const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 7000}`;
          const finalUrl = `${baseUrl}/srt/${subId}.srt`;

          allSubs.push(new SubtitleResult({
            id: `nyaa-${subId}`,
            url: finalUrl,
            language: normalizeLang(sub.language) || 'eng',
            source: 'nyaa',
            fileName: sub.fileName,
            format: sub.format,
            needsConversion: sub.format !== 'srt'
          }));
        }
      }

      log('info', `[Nyaa] Found ${allSubs.length} subtitles.`);
      return { subtitles: allSubs };
    } catch (err) {
      log('warn', `[Nyaa] Failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = NyaaProvider;