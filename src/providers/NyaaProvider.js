const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { extractSubtitles } = require('../utils/subtitleExtractor');
const subtitleStore = require('../cache/SubtitleStore');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

class NyaaProvider extends BaseProvider {
  constructor() {
    super('NyaaSI', { enabled: true });
  }

  async fetchTorrents(searchQuery) {
    const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(searchQuery)}&c=1_2&f=0`;
    const response = await axios.get(url, { 
      timeout: 8000, 
      headers: { 'User-Agent': 'Mozilla/5.0' } 
    });
    
    const $ = cheerio.load(response.data, { xmlMode: true });
    const torrents = [];
    $('item').slice(0, 5).each((i, el) => {
      const title = $(el).find('title').text();
      // Nyaa RSS não expõe magnet direto, mas expõe o link da página. Precisamos do infoHash.
      const link = $(el).find('link').text();
      const infoHash = $(el).find('infoHash').text(); // Disponível no RSS do Nyaa
      if (infoHash) {
        const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce`;
        torrents.push({ title, magnet });
      }
    });
    return torrents;
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    let torrents = [];
    // 1. Busca focada em Ironclad + Multi-Subs
    const ironcladQuery = `[Ironclad] ${query.searchQuery} Multi-Subs`;
    try { torrents = await this.fetchTorrents(ironcladQuery); } catch (e) {}

    // 2. Fallback genérico com Multi-Subs
    if (torrents.length === 0) {
      const genericQuery = `${query.searchQuery} Multi-Subs`;
      try { torrents = await this.fetchTorrents(genericQuery); } catch (e) {}
    }

    // 3. Fallback para qualquer torrent do episódio
    if (torrents.length === 0) {
      try { torrents = await this.fetchTorrents(query.searchQuery); } catch (e) {}
    }

    const allSubs = [];
    for (const torrent of torrents.slice(0, 2)) { // Limita a 2 torrents para não estourar tempo
      try {
        log('info', `[NyaaSI] Streaming torrent: ${torrent.title}`);
        const extractedSubs = await extractSubtitles(torrent.magnet, query.languages, 45000);
        
        for (const sub of extractedSubs) {
          const subId = crypto.createHash('md5').update(torrent.magnet + sub.trackNumber).digest('hex').slice(0, 20);
          subtitleStore.set(subId, { content: sub.content, lang: sub.language });
          
          const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 7000}`;
          const finalUrl = `${baseUrl}/srt/${subId}.srt`;

          allSubs.push(new SubtitleResult({
            id: `nyaasi-${subId}`,
            url: finalUrl,
            language: sub.language,
            source: 'NyaaSI',
            fileName: `${torrent.title}.srt`,
            releaseName: torrent.title,
            format: 'srt',
            needsConversion: false
          }));
        }
      } catch (e) {
        log('warn', `[NyaaSI] Failed to process torrent: ${e.message}`);
      }
    }

    log('info', `[NyaaSI] Found ${allSubs.length} subtitles.`);
    return { subtitles: allSubs };
  }
}

module.exports = NyaaProvider;