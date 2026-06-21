// src/openarchive.js
const axios = require('axios');
const cheerio = require('cheerio');

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
};

function normalizeLang(lang) {
    if (!lang) return 'eng';
    lang = lang.toLowerCase();
    const langMap = {
        'portuguese': 'por', 'brazilian portuguese': 'por', 'portuguese-brazilian': 'por',
        'english': 'eng', 'spanish': 'spa', 'french': 'fra', 'german': 'deu',
        'italian': 'ita', 'japanese': 'jpn', 'chinese': 'chi', 'russian': 'rus',
        'arabic': 'ara', 'hindi': 'hin', 'korean': 'kor'
    };
    return langMap[lang] || lang;
}

// Provider for Yifysubtitles
async function searchYify(imdbId) {
    if (!imdbId) return [];
    try {
        const url = `https://yifysubtitles.org/movie-imdb/${imdbId}`;
        const response = await axios.get(url, { headers, timeout: 10000 });
        const $ = cheerio.load(response.data);
        const subs = [];
        $('table tr').each((i, el) => {
            const langText = $(el).find('.sub-lang').text().trim();
            const link = $(el).find('a.download').attr('href');
            if (link && langText) {
                subs.push({ url: link.startsWith('http') ? link : `https://yifysubtitles.org${link}`, fileName: 'yify_sub.zip', lang: normalizeLang(langText) });
            }
        });
        return subs;
    } catch (e) { console.log("[SubAlchemy] YIFY: Failed or blocked"); return []; }
}

// Provider for Podnapisi
async function searchPodnapisi(query) {
    if (!query) return [];
    try {
        const url = `https://www.podnapisi.net/en/subtitles/search/advanced?keywords=${encodeURIComponent(query)}`;
        const response = await axios.get(url, { headers, timeout: 10000 });
        const $ = cheerio.load(response.data);
        const subs = [];
        $('tbody tr').each((i, el) => {
            const langText = $(el).find('td:nth-child(3) .flag').attr('title') || $(el).find('td:nth-child(3)').text().trim();
            const link = $(el).find('td:nth-child(5) a').attr('href');
            if (link && langText) {
                const fullLink = link.startsWith('http') ? link : `https://www.podnapisi.net${link}`;
                subs.push({ url: fullLink, fileName: 'podnapisi_sub.zip', lang: normalizeLang(langText) });
            }
        });
        return subs;
    } catch (e) { console.log("[SubAlchemy] Podnapisi: Failed or blocked"); return []; }
}

// Provider for Subf2m
async function searchSubf2m(query) {
    if (!query) return [];
    try {
        const searchUrl = `https://subf2m.co/subtitles/searchbytitle?query=${encodeURIComponent(query)}`;
        const searchRes = await axios.get(searchUrl, { headers, timeout: 10000 });
        const $s = cheerio.load(searchRes.data);
        const firstResult = $s('.title a').attr('href');
        if (!firstResult) return [];
        
        const movieUrl = `https://subf2m.co${firstResult}`;
        const movieRes = await axios.get(movieUrl, { headers, timeout: 10000 });
        const $m = cheerio.load(movieRes.data);
        
        const subs = [];
        $m('tbody tr').each((i, el) => {
            const langText = $m(el).find('.sub-lang').text().trim();
            const link = $m(el).find('a.download').attr('href');
            if (link && langText) {
                subs.push({ url: `https://subf2m.co${link}`, fileName: 'subf2m_sub.zip', lang: normalizeLang(langText) });
            }
        });
        return subs;
    } catch (e) { console.log("[SubAlchemy] Subf2m: Failed or blocked"); return []; }
}

// Provider for Gestdown
async function searchGestdown(query) {
    if (!query) return [];
    try {
        const searchUrl = `https://gestdown.info/search?query=${encodeURIComponent(query)}`;
        const searchRes = await axios.get(searchUrl, { headers, timeout: 10000 });
        const $s = cheerio.load(searchRes.data);
        const firstResult = $s('a[href^="/sous-titres/"]').attr('href');
        if (!firstResult) return [];

        const showUrl = `https://gestdown.info${firstResult}`;
        const showRes = await axios.get(showUrl, { headers, timeout: 10000 });
        const $sh = cheerio.load(showRes.data);
        
        const subs = [];
        $sh('table tr').each((i, el) => {
            const langText = $sh(el).find('.flag').attr('title') || $sh(el).find('td:nth-child(3)').text().trim();
            const link = $sh(el).find('a[href^="/sous-titres/download/"]').attr('href');
            if (link && langText) {
                subs.push({ url: `https://gestdown.info${link}`, fileName: 'gestdown_sub.zip', lang: normalizeLang(langText) });
            }
        });
        return subs;
    } catch (e) { console.log("[SubAlchemy] Gestdown: Failed or blocked"); return []; }
}

// Provider for TVsubtitles
async function searchTVsubtitles(query) {
    if (!query) return [];
    try {
        const searchUrl = `http://www.tvsubtitles.net/search.php?q=${encodeURIComponent(query)}`;
        const searchRes = await axios.get(searchUrl, { headers, timeout: 10000 });
        const $s = cheerio.load(searchRes.data);
        const firstResult = $s('li a').attr('href');
        if (!firstResult) return [];

        const showUrl = `http://www.tvsubtitles.net${firstResult}`;
        const showRes = await axios.get(showUrl, { headers, timeout: 10000 });
        const $sh = cheerio.load(showRes.data);
        
        const subs = [];
        $sh('table tr').each((i, el) => {
            const langText = $sh(el).find('td:nth-child(3) img').attr('alt') || $sh(el).find('td:nth-child(3)').text().trim();
            const link = $sh(el).find('a[href^="/download-"]').attr('href');
            if (link && langText) {
                subs.push({ url: `http://www.tvsubtitles.net${link}`, fileName: 'tvsubs_sub.zip', lang: normalizeLang(langText) });
            }
        });
        return subs;
    } catch (e) { console.log("[SubAlchemy] TVsubtitles: Failed or blocked"); return []; }
}

// OpenArchive integration (Bypass API cloud block)
async function searchOpenArchive(imdbId) {
    if (!imdbId) return [];
    const numericId = imdbId.replace('tt', '');
    try {
        const url = `https://www.opensubtitles.org/en/search/imdbid-${numericId}/sublanguageid-all`;
        const response = await axios.get(url, { headers, timeout: 10000 });
        const $ = cheerio.load(response.data);
        const subs = [];
        
        $('table#search_results tr').each((i, el) => {
            const link = $(el).find('a[href*="/subtitleserve/sub/"]').attr('href');
            // Get language from flag image title/alt
            const langText = $(el).find('td:nth-child(2) img').attr('alt') || $(el).find('.flag img').attr('alt') || '';
            
            if (link && langText) {
                const fullLink = link.startsWith('http') ? link : `https://www.opensubtitles.org${link}`;
                subs.push({
                    url: fullLink,
                    fileName: 'openarchive_sub.zip', 
                    lang: normalizeLang(langText)
                });
            }
        });
        console.log(`[SubAlchemy] OpenArchive: Found ${subs.length} subs.`);
        return subs;
    } catch (e) { 
        console.log(`[SubAlchemy] OpenArchive: Failed or blocked (${e.message})`); 
        return []; 
    }
}

module.exports = { searchYify, searchPodnapisi, searchSubf2m, searchGestdown, searchTVsubtitles, searchOpenArchive };