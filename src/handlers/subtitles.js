const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt } = require('../converters');
const subtitleStore = require('../cache/SubtitleStore');
const { getCinemetaTitle } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const { log } = require('../logger');
const { OS_DIRECT_URL_RE } = require('../constants');
const { normalizeLanguage, getLanguageName, isPortuguese, generatePlaceholder } = require('../utils/subtitleUtils');
const crypto = require('crypto');

async function handleSubtitlesRequest(args, config, baseUrl) {
  const { id, type } = args;
  const parsed = parseStremioId(id);
  const userAgent = config._userAgent || '';
  
  let searchQuery = null;
  if (parsed.kitsuId) {
    searchQuery = await getKitsuTitle(parsed.kitsuId);
    log('info', `[Handler] Kitsu Anime detected. Title: ${searchQuery}`);
  } else if (parsed.imdbId) {
    searchQuery = await getCinemetaTitle(parsed.imdbId, type);
    log('info', `[Handler] IMDB ID: ${parsed.imdbId}. Cinemeta Title: ${searchQuery}`);
  }

  let requestedLangs = ['eng'];
  if (config.languages) {
    let langArray = [];
    if (Array.isArray(config.languages)) {
      langArray = config.languages;
    } else if (typeof config.languages === 'string') {
      langArray = config.languages.split(',').map(l => l.trim()).filter(Boolean);
    }
    requestedLangs = langArray.map(normalizeLanguage).filter(Boolean);
  }

  const query = {
    ...parsed,
    searchQuery,
    languages: requestedLangs,
    apiKeys: {
      subdlApiKey: config.subdlApiKey,
      subsourceApiKey: config.subsourceApiKey,
      wyzieApiKey: config.wyzieApiKey
    }
  };

  const { subtitles } = await providerManager.searchAll(query);
  log('info', `[Handler] Found ${subtitles.length} total subtitles before language filter.`);

  const userWantsPt = requestedLangs.some(isPortuguese);
  const userWantsEn = requestedLangs.includes('eng');

  // 1. Filtra PT-BR primeiro
  let filteredSubs = [];
  if (userWantsPt) {
    filteredSubs = subtitles.filter(sub => isPortuguese(sub.language));
  }

  // 2. Se não achou PT, busca Inglês
  let isFallback = false;
  if (filteredSubs.length === 0 && userWantsEn) {
    log('warn', `[Handler] No PT subs found. Falling back to English.`);
    filteredSubs = subtitles.filter(sub => normalizeLanguage(sub.language) === 'eng');
    isFallback = true;
  }

  // 3. Se não achou nem PT nem EN, retorna placeholder
  if (filteredSubs.length === 0) {
    log('warn', `[Handler] No subs found at all. Returning placeholder.`);
    const subId = crypto.createHash('md5').update('placeholder' + id).digest('hex').slice(0, 20);
    subtitleStore.set(subId, { content: generatePlaceholder('No subtitles available for this episode'), lang: 'eng' });
    return { 
      subtitles: [{ 
        id: `placeholder-${subId}`, 
        url: `${baseUrl}/srt/${subId}.srt`, 
        lang: 'eng', 
        name: 'SubAlchemy [No Subs Found]' 
      }] 
    };
  }

  log('info', `[Handler] Found ${filteredSubs.length} unique subtitles after language filter. Starting conversion...`);

  const subtitlesPromises = filteredSubs.map(async (sub) => {
    try {
      let finalUrl = sub.url;
      const langName = getLanguageName(sub.language) || sub.language || 'Unknown';
      
      const displayName = sub.releaseName || sub.fileName || 'Unknown';
      let subName = `SubAlchemy [${langName}] - ${displayName}`;
      if (isFallback) subName += ' (Fallback)';

      // Se a URL já aponta para o nosso proxy, não converte de novo
      if (sub.url.includes('/srt/')) {
        return { id: sub.id, url: sub.url, lang: sub.language, name: subName };
      }

      if (OS_DIRECT_URL_RE.test(sub.url) && isStremioClient(userAgent)) {
        return { 
          id: sub.id, 
          url: `http://127.0.0.1:11470/subtitles.srt?from=${encodeURIComponent(sub.url)}`, 
          lang: sub.language,
          name: subName 
        };
      }

      if (sub.needsConversion || sub.format !== 'srt' || !isStremioClient(userAgent)) {
        const srtContent = await convertToSrt(sub);
        if (!srtContent) return null;
        
        const subId = crypto.createHash('md5').update(sub.url).digest('hex').slice(0, 20);
        subtitleStore.set(subId, { content: srtContent, lang: sub.language });
        finalUrl = `${baseUrl}/srt/${subId}.srt`;
      }

      return { 
        id: sub.id, 
        url: finalUrl, 
        lang: sub.language,
        name: subName 
      };
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