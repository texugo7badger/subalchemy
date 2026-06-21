// addon.js
require('dotenv').config();
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Import modules
const { vttToSrt, assToSrt, removeAds } = require('./src/converters');
const { getKitsuTitle, searchOpenSubtitles, searchSubDL, searchSubSource, searchWyzie, searchAnimeTosho } = require('./src/sources');
const { getConfigureHTML } = require('./src/configurePage');

// ==========================================
// CONFIGURATION: PORT AND BASE URL
// ==========================================
const PORT = process.env.PORT || 7000;
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
console.log(`[SubAlchemy] Server starting. Base URL: ${BASE_URL}`);

const subtitlesCache = new Map();

// ==========================================
// MANIFEST
// ==========================================
const manifest = {
    id: "org.subalchemy.addon",
    version: "1.0.1",
    name: "SubAlchemy",
    description: "Universal SRT Converter. Fetches from multiple sources, supports Anime (Kitsu), and converts VTT/ASS to SRT.",
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: false },
    config: [
        { key: 'osApiKey', type: 'string', title: 'OpenSubtitles API Key', default: process.env.OPENSUBTITLES_API_KEY || '' },
        { key: 'subdlApiKey', type: 'string', title: 'SubDL API Key', default: process.env.SUBDL_API_KEY || '' },
        { key: 'subsourceApiKey', type: 'string', title: 'SubSource API Key', default: process.env.SUBSOURCE_API_KEY || '' },
        { key: 'wyzieApiKey', type: 'string', title: 'Wyzie API Key', default: process.env.WYZIE_API_KEY || '' },
        { key: 'languages', type: 'string', title: 'Languages', default: 'en,pt-br,es,fr,de,it,ja,zh,ru,ar,hi,ko' }
    ]
};

const builder = new addonBuilder(manifest);

// ==========================================
// STREMIO SUBTITLES HANDLER
// ==========================================
builder.defineSubtitlesHandler(async ({ id, type, config }) => {
    console.log(`[SubAlchemy] Request received for: ${id}`);
    
    let imdbId = null;
    let searchQuery = null;
    
    if (id.startsWith('kitsu:')) {
        const kitsuId = id.split(':')[1];
        searchQuery = await getKitsuTitle(kitsuId);
    } else {
        imdbId = id.split(':')[0];
    }
    
    const apiKeys = {
        osApiKey: config?.osApiKey || process.env.OPENSUBTITLES_API_KEY,
        subdlApiKey: config?.subdlApiKey || process.env.SUBDL_API_KEY,
        subsourceApiKey: config?.subsourceApiKey || process.env.SUBSOURCE_API_KEY,
        wyzieApiKey: config?.wyzieApiKey || process.env.WYZIE_API_KEY
    };
    const languages = config?.languages || 'en,pt-br,es,fr,de,it,ja,zh,ru,ar,hi,ko';

    console.log("[SubAlchemy] Searching multiple sources...");
    const [osSubs, subdlSubs, subsourceSubs, wyzieSubs, animeToshoSubs] = await Promise.all([
        searchOpenSubtitles({ imdbId, query: searchQuery, type, apiKey: apiKeys.osApiKey, languages }),
        searchSubDL({ imdbId, query: searchQuery, apiKey: apiKeys.subdlApiKey, languages }),
        searchSubSource({ query: searchQuery, apiKey: apiKeys.subsourceApiKey }),
        searchWyzie({ imdbId, query: searchQuery, apiKey: apiKeys.wyzieApiKey }),
        searchAnimeTosho({ query: searchQuery })
    ]);

    const allSubs = [...osSubs, ...subdlSubs, ...subsourceSubs, ...wyzieSubs, ...animeToshoSubs];
    const uniqueUrls = new Set();
    const uniqueSubs = allSubs.filter(sub => {
        if (uniqueUrls.has(sub.url)) return false;
        uniqueUrls.add(sub.url);
        return true;
    });

    const subtitlesPromises = uniqueSubs.map(async (sub) => {
        try {
            // Se for SRT direto, baixamos, limpamos os anúncios e servimos pelo nosso cache
            if (sub.fileName.toLowerCase().endsWith('.srt') || sub.url.toLowerCase().includes('.srt')) {
                const fileRes = await axios.get(sub.url, { responseType: 'text' });
                let srtContent = fileRes.data;
                
                // Aplica a limpeza de anúncios
                srtContent = removeAds(srtContent);
                
                const subId = Buffer.from(sub.url).toString('base64').slice(0, 20);
                subtitlesCache.set(subId, { content: srtContent, lang: sub.lang, imdbId: imdbId });
                
                return { url: `${BASE_URL}/srt/${subId}.srt`, lang: sub.lang };
            }
            
            // Se for VTT ou ASS, baixa, converte para SRT, limpa anúncios e serve no cache
            if (sub.fileName.toLowerCase().endsWith('.vtt') || sub.fileName.toLowerCase().endsWith('.ass')) {
                const fileRes = await axios.get(sub.url, { responseType: 'text' });
                let srtContent = "";
                
                if (sub.fileName.toLowerCase().endsWith('.ass')) {
                    srtContent = assToSrt(fileRes.data);
                } else {
                    srtContent = vttToSrt(fileRes.data);
                }
                
                if (!srtContent) return null;
                
                const subId = Buffer.from(sub.url).toString('base64').slice(0, 20);
                subtitlesCache.set(subId, { content: srtContent, lang: sub.lang, imdbId: imdbId });
                
                return { url: `${BASE_URL}/srt/${subId}.srt`, lang: sub.lang };
            }
            return null;
        } catch (e) { return null; }
    });

    const subtitles = (await Promise.all(subtitlesPromises)).filter(s => s !== null);
    console.log(`[SubAlchemy] Returning ${subtitles.length} SRT subtitles.`);
    
    return { subtitles: subtitles };
});

// ==========================================
// HTTP SERVER AND CUSTOM ROUTES
// ==========================================
const stremioRouter = getRouter(builder.getInterface());

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // 1. Serve Logo
    if (parsedUrl.pathname === '/subalchemy-logo.png') {
        try {
            const img = fs.readFileSync(path.join(__dirname, 'subalchemy-logo.png'));
            res.writeHead(200, { 'Content-Type': 'image/png' });
            res.end(img);
            return;
        } catch (e) { res.writeHead(404); res.end('Image not found'); return; }
    }

    // 2. Serve Custom Config Page
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/configure') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getConfigureHTML(BASE_URL));
        return;
    }

    // 3. API Test Route
    if (parsedUrl.pathname === '/test-api') {
        const { type, key } = parsedUrl.query;
        if (!key) { res.writeHead(400); res.end(JSON.stringify({ valid: false })); return; }

        (async () => {
            try {
                if (type === 'os') {
                    await axios.get('https://api.opensubtitles.com/api/v1/subtitles?imdb_id=tt0111161', {
                        headers: { 'Apikey': key, 'User-Agent': 'SubAlchemy Test' }
                    });
                } else if (type === 'subdl') {
                    await axios.get('https://api.subdl.com/api/v1/subtitles?imdb_id=tt0111161', { params: { api_key: key } });
                } 
                // Add subsource/wyzie tests if APIs become available
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ valid: true }));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ valid: false }));
            }
        })();
        return;
    }

    // 4. Serve SRT Cache
    if (parsedUrl.pathname.startsWith('/srt/')) {
        const subId = parsedUrl.pathname.replace('/srt/', '').replace('.srt', '');
        const cachedSub = subtitlesCache.get(subId);
        if (cachedSub) {
            res.writeHead(200, { 'Content-Type': 'application/x-subrip; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(cachedSub.content);
            return;
        } else { res.writeHead(404); res.end('Not found'); return; }
    }

    // 5. Fallback to Stremio SDK
    stremioRouter(req, res);
});

server.listen(PORT, () => console.log(`[SubAlchemy] Addon accessible at: ${BASE_URL}/manifest.json`));