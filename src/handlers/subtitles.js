const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt, convertRawToSrt } = require('../converters');
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

  const ptVariations = ['pob', 'por', 'pb', 'pt', 'pt-br', 'ptbr', 'portuguese', 'português'];
  const filteredSubs = subtitles.filter(sub => {
    const subLang = normalizeLang(sub.language).toLowerCase();
    
    if (requestedLangs.some(r => ptVariations.includes(r))) {
        if (ptVariations.includes(subLang)) return true;
    }
    if (requestedLangs.includes('eng') && (subLang === 'eng' || subLang === 'en')) return true;
    
    return requestedLangs.includes(subLang);
  });

  log('info', `[Handler] Found ${filteredSubs.length} unique subtitles after language filter. Starting conversion...`);

  const subtitlesPromises = filteredSubs.map(async (sub) => {
    try {
      let finalUrl = sub.url;
      const langName = getLanguageName(sub.language) || sub.language || 'Unknown';
      
      // Formata o nome para aparecer perfeitamente no Stremio
      const displayName = sub.releaseName || sub.fileName || 'Unknown';
      const subName = `SubAlchemy [${langName}] - ${displayName}`;

      // Se a URL já aponta para o nosso proxy (caso Nyaa/NekoBT), converte o conteúdo bruto
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