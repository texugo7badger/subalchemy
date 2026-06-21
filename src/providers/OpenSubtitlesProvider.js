const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { OS_BASE, OS_UA, THROTTLE_MS } = require('../constants');
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
    
    // OS legacy API only supports single language filter per request efficiently
    if (query.languages && query.languages.length === 1) {
      searchPath += `/sublanguageid-${normalizeLang(query.languages[0])}`;
    }

    const url = `${OS_BASE}${searchPath}`;
    log('debug', `[OpenSubtitlesProvider] Fetching: ${url}`);
    
    await this._throttle();
    
    try {
      const response = await axios.get(url, {
        headers: { 'X-User-Agent': OS_UA, 'Accept': 'application/json' },
        timeout: 10000
      });

      if (!Array.isArray(response.data)) return { subtitles: [] };

      const results = [];
      for (const entry of response.data) {
        const langCode = (entry.ISO639 || 'eng').toLowerCase();
        
        // Client-side filter if multiple languages requested
        if (query.languages && query.languages.length > 1) {
          const matches = query.languages.some(l => normalizeLang(l) === langCode);
          if (!matches) continue;
        }

        const downloadUrl = entry.SubDownloadLink.replace(/\.gz$/, ''); // Strip .gz for direct srt
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
      log('info', `[OpenSubtitlesProvider] Found ${results.length} subtitles.`);
      return { subtitles: results };
    } catch (err) {
      log('error', `[OpenSubtitlesProvider] Request failed: ${err.message}`);
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