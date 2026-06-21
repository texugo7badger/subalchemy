const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { OS_BASE, THROTTLE_MS } = require('../constants');
const { normalizeLang } = require('../languages');
const axios = require('axios');

class OpenSubtitlesProvider extends BaseProvider {
  constructor() {
    super('opensubtitles', { enabled: true });
    this._lastRequestAt = 0;
  }

  async search(query) {
    if (!query.imdbId) return { subtitles: [] };
    
    const numericId = query.imdbId.replace(/^tt/, '');
    let searchPath = `/search/imdbid-${numericId}`;
    
    if (query.season != null && query.episode != null) {
      searchPath = `/search/episode-${query.episode}/imdbid-${numericId}/season-${query.season}`;
    }
    
    if (query.languages && query.languages.length === 1) {
      searchPath += `/sublanguageid-${normalizeLang(query.languages[0])}`;
    }

    const url = `${OS_BASE}${searchPath}`;
    log('debug', `[OpenSubtitles] Fetching: ${url}`);
    
    await this._throttle();
    
    try {
      const response = await axios.get(url, {
        headers: { 
          'X-User-Agent': 'VLSub 0.10.3', 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // Adicionado UA de navegador
          'Accept': 'application/json' 
        },
        timeout: 10000
      });

      if (!Array.isArray(response.data)) return { subtitles: [] };

      const results = [];
      for (const entry of response.data) {
        const langCode = (entry.ISO639 || 'eng').toLowerCase();
        
        if (query.languages && query.languages.length > 1) {
          const matches = query.languages.some(l => normalizeLang(l) === langCode);
          if (!matches) continue;
        }

        const downloadUrl = entry.SubDownloadLink.replace(/\.gz$/, '');
        results.push(new SubtitleResult({
          id: `os-${entry.IDSubtitleFile}`,
          url: downloadUrl,
          language: langCode,
          source: 'opensubtitles',
          fileName: entry.SubFileName || 'unknown.srt',
          format: 'srt',
          needsConversion: false,
          releaseName: entry.MovieReleaseName || ''
        }));
      }
      log('info', `[OpenSubtitles] Found ${results.length} subtitles.`);
      return { subtitles: results };
    } catch (err) {
      log('error', `[OpenSubtitles] Request failed: ${err.message}`);
      return { subtitles: [] };
    }
  }

  async _throttle() {
    const now = Date.now();
    const elapsed = now - this._lastRequestAt;
    if (elapsed < THROTTLE_MS) {
      await new Promise(r => setTimeout(r, THROTTLE_MS - elapsed));
    }
    this._lastRequestAt = Date.now();
  }
}

module.exports = OpenSubtitlesProvider;