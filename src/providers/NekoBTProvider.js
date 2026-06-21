const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { extractSubtitles } = require('../utils/subtitleExtractor');
const subtitleStore = require('../cache/SubtitleStore');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

class NekoBTProvider extends BaseProvider {
  constructor() {
    super('NekoBT', { enabled: true });
  }

  async fetchMagnets(searchQuery) {
    const url = `https://nekobt.to/?q=${encodeURIComponent(searchQuery)}`;
    const response = await axios.get(url, { 
      timeout: 8000, 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    });
    
    const $ = cheerio.load(response.data);
    const magnets = [];
    $('a[href^="magnet:?"]').slice(0, 5).each((i, el) => {
      const magnet = $(el).attr('href');
      const title = $(el).attr('title') || $(el).closest('tr').find('.title').text().trim() || 'Unknown';
      magnets.push({ title, magnet });
    });
    return magnets;
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    let magnets = [];
    // 1. Busca focada em Erai-raws + MultiSub
    const eraiQuery = `[Erai-raws] ${query.searchQuery} MultiSub`;
    try { magnets = await this.fetchMagnets(eraiQuery); } catch (e) {}

    // 2. Fallback genérico com MultiSub
    if (magnets.length === 0) {
      const genericQuery = `${query.searchQuery} MultiSub`;
      try { magnets = await this.fetchMagnets(genericQuery); } catch (e) {}
    }

    // 3. Fallback para qualquer magnet do episódio
    if (magnets.length === 0) {
      try { magnets = await this.fetchMagnets(query.searchQuery); } catch (e) {}
    }

    const allSubs = [];
    for (const torrent of magnets.slice(0, 2)) {
      log('info', `[NekoBT] Streaming torrent: ${torrent.title}`);
      const extractedSubs = await extractSubtitles(torrent.magnet, query.languages, 45000);
      
      for (const sub of extractedSubs) {
        const subId = crypto.createHash('md5').update(torrent.magnet + sub.trackNumber).digest('hex').slice(0, 20);
        subtitleStore.set(subId, { content: sub.content, lang: sub.language });
        
        const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 7000}`;
        const finalUrl = `${baseUrl}/srt/${subId}.srt`;

        allSubs.push(new SubtitleResult({
          id: `nekobt-${subId}`,
          url: finalUrl,
          language: sub.language,
          source: 'NekoBT',
          fileName: `${torrent.title}.srt`,
          releaseName: torrent.title,
          format: 'srt',
          needsConversion: false
        }));
      }
    }

    log('info', `[NekoBT] Found ${allSubs.length} subtitles.`);
    return { subtitles: allSubs };
  }
}

module.exports = NekoBTProvider;