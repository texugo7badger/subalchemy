const axios = require('axios');
const cheerio = require('cheerio');
const { log } = require('../logger');

class NekoBTStreamProvider {
    constructor() {
        this.name = 'NekoBT';
    }

    async getStreams(searchQuery) {
        if (!searchQuery) return [];
        try {
            const url = `https://nekobt.to/?q=${encodeURIComponent(searchQuery)}`;
            log('debug', `[NekoBTStream] Fetching: ${url}`);
            
            const response = await axios.get(url, {
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const $ = cheerio.load(response.data);
            const streams = [];

            const trackers = [
                'udp://tracker.opentrackr.org:1337/announce',
                'udp://open.demonii.com:1337/announce'
            ];

            $('a[href^="magnet:?"]').slice(0, 10).each((i, el) => {
                const magnet = $(el).attr('href');
                const title = $(el).attr('title') || $(el).closest('tr').find('.title').text().trim() || 'Unknown Release';

                // Extrai o infoHash do magnet link
                const match = magnet.match(/btih:([a-fA-F0-9]{40})/);
                if (match && match[1]) {
                    const infoHash = match[1].toLowerCase();
                    
                    streams.push({
                        name: `SubAlchemy NekoBT 🐱`,
                        title: title,
                        infoHash: infoHash,
                        sources: trackers
                    });
                }
            });

            log('info', `[NekoBTStream] Found ${streams.length} streams for: ${searchQuery}`);
            return streams;
        } catch (err) {
            log('warn', `[NekoBTStream] Failed: ${err.message}`);
            return [];
        }
    }
}

module.exports = NekoBTStreamProvider;