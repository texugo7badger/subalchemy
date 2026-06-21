const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { extractSubs, normalizeLang } = require('../utils/subtitleUtils');
const subtitleStore = require('../cache/SubtitleStore');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');

class NyaaProvider extends BaseProvider {
  constructor() {
    super('NyaaSI', { enabled: true }); // Nome alterado
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
      const torrents = [];

      $('item').slice(0, 3).each((i, el) => {
        const title = $(el).find('title').text();
        const link = $(el).find('link').text();
        if (link) {
          torrents.push({ title, link });
        }
      });

      const allSubs = [];
      for (const torrent of torrents) {
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
                    language: normalizeLang(sub.language),
                    source: 'NyaaSI',
                    fileName: sub.fileName,
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
    } catch (err) {
      log('warn', `[NyaaSI] Failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = NyaaProvider;