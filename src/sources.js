// src/sources.js
const axios = require('axios');

function normalizeLang(lang) {
    if (!lang) return 'eng';
    lang = lang.toLowerCase();
    const langMap = {
        'pt-br': 'por', 'ptbr': 'por', 'portuguese-brazil': 'por',
        'pt': 'por', 'portuguese': 'por',
        'en': 'eng', 'english': 'eng',
        'es': 'spa', 'spanish': 'spa',
        'fr': 'fra', 'french': 'fra',
        'de': 'deu', 'german': 'deu',
        'it': 'ita', 'italian': 'ita',
        'ja': 'jpn', 'japanese': 'jpn',
        'zh': 'chi', 'chinese': 'chi',
        'ru': 'rus', 'russian': 'rus',
        'ar': 'ara', 'arabic': 'ara',
        'hi': 'hin', 'hindi': 'hin',
        'ko': 'kor', 'korean': 'kor'
    };
    return langMap[lang] || lang;
}

async function getKitsuTitle(kitsuId) {
    try {
        const response = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`);
        const title = response.data?.data?.attributes?.canonicalTitle;
        if (title) return title;
    } catch (e) { console.error("[SubAlchemy] Kitsu Error:", e.message); }
    return null;
}

async function searchSubDL({ imdbId, query, apiKey, languages }) {
    if (!apiKey) return [];
    const params = { api_key: apiKey, languages: languages };
    if (imdbId) params.imdb_id = imdbId;
    if (query) params.film_name = query;
    
    try {
        const response = await axios.get('https://api.subdl.com/api/v1/subtitles', { params });
        if (response.data.subtitles) {
            return response.data.subtitles.map(sub => ({
                url: sub.url,
                fileName: sub.release_name ? sub.release_name + '.srt' : 'unknown.srt',
                lang: normalizeLang(sub.language)
            }));
        }
        return [];
    } catch (e) { console.error("[SubAlchemy] SubDL Error:", e.response?.status || e.message); return []; }
}

async function searchSubSource({ query, apiKey }) {
    if (!apiKey || !query) return [];
    return [];
}

async function searchWyzie({ imdbId, query, apiKey }) {
    if (!imdbId && !query) return [];
    try {
        const response = await axios.get('https://api.wyziesubs.dev/v1/subs', {
            params: { imdb: imdbId, title: query }
        });
        if (response.data) {
            return response.data.map(sub => ({
                url: sub.url,
                fileName: sub.filename || "unknown.vtt",
                lang: normalizeLang(sub.lang)
            }));
        }
        return [];
    } catch (e) { console.error("[SubAlchemy] Wyzie Error:", e.response?.status || e.message); return []; }
}

async function searchAnimeTosho({ query }) {
    if (!query) return [];
    try {
        const response = await axios.get('https://animetosho.org/search/api', {
            params: { q: query },
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        const subs = [];
        response.data.forEach(entry => {
            if (entry.attachments) {
                entry.attachments.forEach(att => {
                    if (att.type === 'subtitle') {
                        subs.push({
                            url: att.link,
                            fileName: att.name || "unknown.ass",
                            lang: normalizeLang(att.lang || 'eng')
                        });
                    }
                });
            }
        });
        return subs;
    } catch (e) { console.error("[SubAlchemy] AnimeTosho Error:", e.response?.status || e.message); return []; }
}

module.exports = { normalizeLang, getKitsuTitle, searchSubDL, searchSubSource, searchWyzie, searchAnimeTosho };