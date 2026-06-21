const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt } = require('../converters');
const subtitleStore = require('../cache/SubtitleStore');
const { getCinemetaTitle } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const { log } = require('../logger');
const { OS_DIRECT_URL_RE } = require('../constants');
const { normalizeLang, getLanguageName } = require('../languages');
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
    requestedLangs = langArray.map(normalizeLang);
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

  // FILTRO RIGOROSO E PERMISSIVO para PT-BR
  const ptVariations = ['pob', 'por', 'pb', 'pt', 'pt-br', 'ptbr', 'portuguese', 'português'];
  let filteredSubs = subtitles.filter(sub => {
    const subLang = normalizeLang(sub.language).toLowerCase();
    
    if (requestedLangs.some(r => ptVariations.includes(r))) {
        if (ptVariations.includes(subLang)) return true;
    }
    if (requestedLangs.includes('eng') && (subLang === 'eng' || subLang === 'en')) return true;
    
    return requestedLangs.includes(subLang);
  });

  // FALLBACK INTELIGENTE: Se não achou o idioma desejado, retorna as em Inglês
  let isFallback = false;
  if (filteredSubs.length === 0 && subtitles.length > 0) {
    log('warn', `[Handler] No subtitles found for requested languages. Falling back to English.`);
    filteredSubs = subtitles.filter(sub => normalizeLang(sub.language) === 'eng');
    
    // Se nem inglês tiver, retorna tudo
    if (filteredSubs.length === 0) {
        filteredSubs = subtitles;
    }
    isFallback = true;
  }

  log('info', `[Handler] Found ${filteredSubs.length} unique subtitles after language filter. Starting conversion...`);

  const subtitlesPromises = filteredSubs.map(async (sub) => {
    try {
      let finalUrl = sub.url;
      const langName = getLanguageName(sub.language);
      const subName = `SubAlchemy SRT [${langName}]${isFallback ? ' (Fallback)' : ''}`;
      
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