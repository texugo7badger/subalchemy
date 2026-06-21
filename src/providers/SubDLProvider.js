const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLang } = require('../languages');
const axios = require('axios');

class SubDLProvider extends BaseProvider {
  constructor() {
    super('subdl', { enabled: true });
  }

  async search(query) {
    const apiKey = query.apiKeys?.subdlApiKey;
    if (!apiKey || !query.imdbId) return { subtitles: [] };

    const params = { api_key: apiKey, imdb_id: query.imdbId };
    if (query.season) params.season_number = query.season;
    if (query.episode) params.episode_number = query.episode;
    if (query.languages?.length > 0) params.languages = query.languages.map(normalizeLang).join(',');

    try {
      const response = await axios.get('https://api.subdl.com/api/v1/subtitles', { params, timeout: 8000 });
      if (!response.data?.subtitles) return { subtitles: [] };

      return {
        subtitles: response.data.subtitles.map(sub => {
          // CORREÇÃO: Usar o domínio principal subdl.com para baixar
          let fullUrl = sub.url;
          if (fullUrl && !fullUrl.startsWith('http')) {
            fullUrl = 'https://subdl.com' + fullUrl;
          }

          return new SubtitleResult({
            id: `subdl-${sub.subtitleId || sub.url}`,
            url: fullUrl,
            language: normalizeLang(sub.language),
            source: 'subdl',
            fileName: sub.release_name ? sub.release_name + '.srt' : 'unknown.srt',
            format: 'zip',
            needsConversion: true
          });
        })
      };
    } catch (err) {
      log('error', `[SubDL] Failed: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = SubDLProvider;