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
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    try {
      const searchQuery = `${query.searchQuery}`;
      const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(searchQuery)}&c=1_2&f=0`;
      
      const response = await axios.get(url, { 
        timeout: 8000, 
        headers: { 'User-Agent': 'Mozilla/5.0' } 
      });
      
      const $ = cheerio.load(response.data, { xmlMode: true });
      const magnets = [];

      // Extrai os infoHashes do RSS para construir os magnet links
      $('item').slice(0, 3).each((i, el) => {
        const infoHash = $(el).find('infoHash').text();
        const title = $(el).find('title').text();
        if (infoHash) {
          const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fopen.demonii.com%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80%2Fannounce`;
          magnets.push({ title, magnet });
        }
      });

      const allSubs = [];
      for (const torrent of magnets) {
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
            language: normalizeLang(sub.language),
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