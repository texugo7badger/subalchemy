const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt } = require('../converters');
const subtitleStore = require('../cache/SubtitleStore');
const { getCinemetaTitle } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const { log } = require('../logger');
const { OS_DIRECT_URL_RE } = require('../constants');
const crypto = require('crypto');

async function handleSubtitlesRequest(args, config) {
  const { id, type } = args;
  const parsed = parseStremioId(id);
  const userAgent = args._userAgent || '';
  
  let searchQuery = null;
  if (parsed.kitsuId) {
    searchQuery = await getKitsuTitle(parsed.kitsuId);
    log('info', `[Handler] Kitsu Anime detected. Title: ${searchQuery}`);
  } else if (parsed.imdbId) {
    searchQuery = await getCinemetaTitle(parsed.imdbId, type);
    log('info', `[Handler] IMDB ID: ${parsed.imdbId}. Cinemeta Title: ${searchQuery}`);
  }

  const query = {
    ...parsed,
    searchQuery,
    languages: config.languages ? config.languages.split(',') : ['en'],
    apiKeys: {
      subdlApiKey: config.subdlApiKey,
      subsourceApiKey: config.subsourceApiKey,
      wyzieApiKey: config.wyzieApiKey
    }
  };

  const { subtitles } = await providerManager.searchAll(query);
  log('info', `[Handler] Found ${subtitles.length} unique subtitles. Starting conversion...`);

  const subtitlesPromises = subtitles.map(async (sub) => {
    try {
      let finalUrl = sub.url;
      
      // If it's an OpenSubtitles URL and client is Stremio, let Stremio's streaming server handle it
      if (OS_DIRECT_URL_RE.test(sub.url) && isStremioClient(userAgent)) {
        return { url: `http://127.0.0.1:11470/subtitles.srt?from=${encodeURIComponent(sub.url)}`, lang: sub.language };
      }

      // Otherwise, download, convert to SRT, cache, and serve via proxy
      if (sub.needsConversion || sub.format !== 'srt' || !isStremioClient(userAgent)) {
        const srtContent = await convertToSrt(sub);
        if (!srtContent) return null;
        
        const subId = crypto.createHash('md5').update(sub.url).digest('hex').slice(0, 20);
        subtitleStore.set(subId, { content: srtContent, lang: sub.language });
        finalUrl = `${process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 7000}`}/srt/${subId}.srt`;
      }

      return { url: finalUrl, lang: sub.language };
    } catch (e) {
      log('error', `[Handler] Processing error for ${sub.url}: ${e.message}`);
      return null;
    }
  });

  const finalSubs = (await Promise.all(subtitlesPromises)).filter(s => s !== null);
  log('info', `[Handler] Returning ${finalSubs.length} SRT subtitles to Stremio.`);
  
  return { subtitles: finalSubs };
}

module.exports = { handleSubtitlesRequest };