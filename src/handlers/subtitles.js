const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt, convertRawToSrt } = require('../converters');
const subtitleStore = require('../cache/SubtitleStore');
const { getCinemetaTitle } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const { log } = require('../logger');
const { OS_DIRECT_URL_RE } = require('../constants');
const { normalizeLanguage, getLanguageName, isPortuguese } = require('../languages');
const crypto = require('crypto');

// Legenda placeholder para não travar o Stremio
const PLACEHOLDER_SRT = `1
00:00:00,000 --> 00:00:05,000
Baixando legenda em português...
Por favor, aguarde alguns segundos.

2
00:00:05,000 --> 00:00:10,000
A legenda estará disponível em breve.`;

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

  const filteredSubs = subtitles.filter(sub => {
    const subLang = normalizeLanguage(sub.language);
    if (!subLang) return false;
    
    if (userWantsPt && isPortuguese(subLang)) return true;
    if (userWantsEn && subLang === 'eng') return true;
    if (requestedLangs.includes(subLang)) return true;
    
    return false;
  });

  log('info', `[Handler] Found ${filteredSubs.length} unique subtitles after language filter. Starting conversion...`);

  // Se não encontrou o idioma desejado, mas achou outros, retorna placeholder
  if (filteredSubs.length === 0 && subtitles.length > 0 && userWantsPt) {
    log('warn', `[Handler] No PT subs found. Returning placeholder.`);
    const subId = crypto.createHash('md5').update('placeholder' + id).digest('hex').slice(0, 20);
    subtitleStore.set(subId, { content: PLACEHOLDER_SRT, lang: 'eng' }); // Eng para o Stremio mostrar
    return { 
      subtitles: [{ 
        id: `placeholder-${subId}`, 
        url: `${baseUrl}/srt/${subId}.srt`, 
        lang: 'eng', 
        name: 'SubAlchemy [Loading PT-BR...]' 
      }] 
    };
  }

  const subtitlesPromises = filteredSubs.map(async (sub) => {
    try {
      let finalUrl = sub.url;
      const langName = getLanguageName(sub.language) || sub.language || 'Unknown';
      
      const displayName = sub.releaseName || sub.fileName || 'Unknown';
      const subName = `SubAlchemy [${langName}] - ${displayName}`;

      if (sub.url.includes('/srt/')) {
        const subId = sub.url.split('/srt/')[1].replace('.srt', '');
        const cached = subtitleStore.get(subId);
        
        if (cached && sub.needsConversion) {
          const srtContent = convertRawToSrt(cached.content, sub.format);
          if (!srtContent) return null;
          subtitleStore.set(subId, { content: srtContent, lang: sub.language });
        }
        
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