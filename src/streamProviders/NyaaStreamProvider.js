const axios = require('axios');
const cheerio = require('cheerio');
const { log } = require('../logger');

class NyaaStreamProvider {
    constructor() {
        this.name = 'Nyaa';
    }

    async getStreams(searchQuery) {
        if (!searchQuery) return [];
        try {
            const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(searchQuery)}&c=1_2&f=0`;
            log('debug', `[NyaaStream] Fetching: ${url}`);
            
            const response = await axios.get(url, {
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const $ = cheerio.load(response.data, { xmlMode: true });
            const streams = [];

            $('item').slice(0, 10).each((i, el) => {
                const title = $(el).find('title').text().trim();
                const infoHash = $(el).find('infoHash').text().trim();
                
                if (title && infoHash) {
                    // Monta o magnet link com trackers saudáveis
                    const trackers = [
                        'udp://tracker.opentrackr.org:1337/announce',
                        'udp://open.demonii.com:1337/announce',
                        'udp://tracker.openbittorrent.com:80/announce',
                        'wss://tracker.btorrent.xyz'
                    ];
                    const magnet = `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}&tr=${trackers.map(t => encodeURIComponent(t)).join('&tr=')}`;

                    streams.push({
                        name: `SubAlchemy Nyaa 🌸`,
                        title: title,
                        magnet: magnet
                    });
                }
            });

            log('info', `[NyaaStream] Found ${streams.length} streams for: ${searchQuery}`);
            return streams;
        } catch (err) {
            log('warn', `[NyaaStream] Failed: ${err.message}`);
            return [];
        }
    }
}

module.exports = NyaaStreamProvider;