const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { extractSubs, normalizeLanguage } = require('../utils/subtitleUtils');
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
      const link = $(el).find('link').text();
      if (link) torrents.push({ title, link });
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
    for (const torrent of torrents.slice(0, 3)) {
      try {
        log('info', `[NyaaSI] Downloading torrent file: ${torrent.title}`);
        const torrentRes = await axios.get(torrent.link, { 
          responseType: 'arraybuffer', 
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0' } 
        });
        const torrentBuffer = Buffer.from(torrentRes.data);
        
        log('info', `[NyaaSI] Extracting subs from: ${torrent.title}`);
        const extractedSubs = await extractSubs(torrentBuffer);
        
        for (const sub of extractedSubs) {
          const subId = crypto.createHash('md5').update(torrent.link + sub.fileName).digest('hex').slice(0, 20);
          subtitleStore.set(subId, { content: sub.content, lang: sub.language || 'eng' });
          
          const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 7000}`;
          const finalUrl = `${baseUrl}/srt/${subId}.srt`;

          allSubs.push(new SubtitleResult({
            id: `nyaasi-${subId}`,
            url: finalUrl,
            language: normalizeLanguage(sub.language) || 'eng',
            source: 'NyaaSI',
            fileName: sub.fileName,
            releaseName: torrent.title,
            format: sub.format,
            needsConversion: sub.format !== 'srt'
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