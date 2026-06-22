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

            $('a[href^="magnet:?"]').slice(0, 10).each((i, el) => {
                const magnet = $(el).attr('href');
                const title = $(el).attr('title') || $(el).closest('tr').find('.title').text().trim() || 'Unknown Release';

                if (magnet && title) {
                    streams.push({
                        name: `SubAlchemy NekoBT 🐱`,
                        title: title,
                        magnet: magnet
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