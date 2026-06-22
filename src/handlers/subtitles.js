const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt } = require('../converters');
const subtitleStore = require('../cache/SubtitleStore');
const { getCinemetaTitle } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const { log } = require('../logger');
const { OS_DIRECT_URL_RE } = require('../constants');
const { normalizeLanguage, isPortuguese, generatePlaceholder } = require('../utils/subtitleUtils');
const crypto = require('crypto');

async function handleSubtitlesRequest(args, config, baseUrl) {
  const { id, type } = args;
  const parsed = parseStremioId(id);
  const userAgent = config._userAgent || '';
  
  let searchQuery = null;
  if (parsed.kitsuId) {
    searchQuery = await getKitsuTitle(parsed.kitsuId);
  } else if (parsed.imdbId) {
    searchQuery = await getCinemetaTitle(parsed.imdbId, type);
  }

  let requestedLangs = ['eng'];
  if (config.languages) {
    let langArray = [];
    if (Array.isArray(config.languages)) langArray = config.languages;
    else if (typeof config.languages === 'string') langArray = config.languages.split(',');
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
  log('info', `[Handler] Found ${subtitles.length} total subtitles before filter.`);

  const userWantsPt = requestedLangs.some(isPortuguese);
  const userWantsEn = requestedLangs.includes('eng');

  // 1. Tenta achar PT
  let filteredSubs = [];
  if (userWantsPt) {
    filteredSubs = subtitles.filter(sub => isPortuguese(sub.language));
  }

  // 2. Se não achou PT, tenta EN
  let isFallback = false;
  if (filteredSubs.length === 0 && userWantsEn) {
    filteredSubs = subtitles.filter(sub => normalizeLanguage(sub.language) === 'eng');
    isFallback = true;
  }

  // 3. Se não achou nada, Placeholder
  if (filteredSubs.length === 0) {
    log('warn', `[Handler] No subs found. Returning placeholder.`);
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

  // LIMPEZA DA UI: Pega apenas a primeira legenda encontrada do idioma desejado.
  const bestSub = filteredSubs[0];
  const langName = isPortuguese(bestSub.language) ? 'Portuguese' : 'English';
  const subName = `SubAlchemy [${langName}]${isFallback ? ' (Fallback)' : ''}`;

  try {
    let finalUrl = bestSub.url;

    if (OS_DIRECT_URL_RE.test(bestSub.url) && isStremioClient(userAgent)) {
      return { 
        subtitles: [{ 
          id: bestSub.id, 
          url: `http://127.0.0.1:11470/subtitles.srt?from=${encodeURIComponent(bestSub.url)}`, 
          lang: bestSub.language,
          name: subName 
        }] 
      };
    }

    if (bestSub.needsConversion || bestSub.format !== 'srt' || !isStremioClient(userAgent)) {
      const srtContent = await convertToSrt(bestSub);
      if (!srtContent) return { subtitles: [] };
      
      const subId = crypto.createHash('md5').update(bestSub.url).digest('hex').slice(0, 20);
      subtitleStore.set(subId, { content: srtContent, lang: bestSub.language });
      finalUrl = `${baseUrl}/srt/${subId}.srt`;
    }

    log('info', `[Handler] Returning 1 perfect SRT subtitle to Stremio.`);
    return { 
      subtitles: [{ 
        id: bestSub.id, 
        url: finalUrl, 
        lang: bestSub.language,
        name: subName 
      }] 
    };
  } catch (e) {
    log('error', `[Handler] Processing error: ${e.message}`);
    return { subtitles: [] };
  }
}
module.exports = { handleSubtitlesRequest };