// addon.js
require('dotenv').config();
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Import modules
const { vttToSrt, assToSrt, removeAds } = require('./src/converters');
const { getKitsuTitle, searchSubDL, searchSubSource, searchWyzie, searchAnimeTosho } = require('./src/sources');
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
    version: "1.0.8",
    name: "SubAlchemy",
    description: "Universal SRT Converter. Fetches from multiple cloud-friendly sources, supports Anime, and converts VTT/ASS to SRT.",
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [],
    behaviorHints: { configurable: true, configurationRequired: false },
    config: [
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
        subdlApiKey: config?.subdlApiKey || process.env.SUBDL_API_KEY,
        subsourceApiKey: config?.subsourceApiKey || process.env.SUBSOURCE_API_KEY,
        wyzieApiKey: config?.wyzieApiKey || process.env.WYZIE_API_KEY
    };
    const languages = config?.languages || 'en,pt-br,es,fr,de,it,ja,zh,ru,ar,hi,ko';

    console.log("[SubAlchemy] Searching multiple sources...");
    const [subdlSubs, subsourceSubs, wyzieSubs, animeToshoSubs] = await Promise.all([
        searchSubDL({ imdbId, query: searchQuery, apiKey: apiKeys.subdlApiKey, languages }),
        searchSubSource({ query: searchQuery, apiKey: apiKeys.subsourceApiKey }),
        searchWyzie({ imdbId, query: searchQuery, apiKey: apiKeys.wyzieApiKey }),
        searchAnimeTosho({ query: searchQuery })
    ]);

    const allSubs = [...subdlSubs, ...subsourceSubs, ...wyzieSubs, ...animeToshoSubs];
    const uniqueUrls = new Set();
    const uniqueSubs = allSubs.filter(sub => {
        if (uniqueUrls.has(sub.url)) return false;
        uniqueUrls.add(sub.url);
        return true;
    });

    const subtitlesPromises = uniqueSubs.map(async (sub) => {
        try {
            if (sub.fileName.toLowerCase().endsWith('.srt') || sub.url.toLowerCase().includes('.srt')) {
                const fileRes = await axios.get(sub.url, { responseType: 'text' });
                let srtContent = fileRes.data;
                
                srtContent = removeAds(srtContent);
                
                const subId = Buffer.from(sub.url).toString('base64').slice(0, 20);
                subtitlesCache.set(subId, { content: srtContent, lang: sub.lang, imdbId: imdbId });
                
                return { url: `${BASE_URL}/srt/${subId}.srt`, lang: sub.lang };
            }
            
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
// EXPRESS SERVER AND CUSTOM ROUTES
// ==========================================
const app = express();
const stremioRouter = getRouter(builder.getInterface());

// 1. Serve Logo
app.get('/subalchemy-logo.png', (req, res) => {
    try {
        const img = fs.readFileSync(path.join(__dirname, 'subalchemy-logo.png'));
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
    } catch (e) { res.status(404).send('Image not found'); }
});

// 2. Serve Custom Config Page
app.get(['/', '/configure'], (req, res) => {
    res.set('Content-Type', 'text/html');
    res.send(getConfigureHTML(BASE_URL));
});

// 3. API Test Route
app.get('/test-api', async (req, res) => {
    const { type, key } = req.query;
    if (!key) return res.status(400).json({ valid: false });

    try {
        if (type === 'subdl') {
            await axios.get('https://api.subdl.com/api/v1/subtitles?imdb_id=tt0111161', { params: { api_key: key.trim() } });
        } 
        // Add subsource/wyzie tests if APIs become available
        res.json({ valid: true });
    } catch (e) {
        const status = e.response?.status;
        const message = e.response?.data?.message || e.message;
        console.error(`[SubAlchemy] Test API Error (${type}):`, status, message);
        res.json({ valid: false, error: `Error ${status || ''}: ${message}` });
    }
});

// 4. Serve SRT Cache
app.get('/srt/:subId', (req, res) => {
    const subId = req.params.subId.replace('.srt', '');
    const cachedSub = subtitlesCache.get(subId);
    if (cachedSub) {
        res.set('Content-Type', 'application/x-subrip; charset=utf-8');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(cachedSub.content);
    } else {
        res.status(404).send('Not found');
    }
});

// 5. Fallback to Stremio SDK Router (handles /manifest.json, etc)
app.use(stremioRouter);

// Start server
app.listen(PORT, () => {
    console.log(`[SubAlchemy] Addon accessible at: ${BASE_URL}/manifest.json`);
});