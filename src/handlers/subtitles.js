const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt } = require('../converters');
const subtitleStore = require('../cache/SubtitleStore');
const { getCinemetaTitle } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const { log } = require('../logger');
const { OS_DIRECT_URL_RE } = require('../constants');
const { normalizeLanguage, getLanguageName } = require('../utils/subtitleUtils');
const crypto = require('crypto');

/**
 * Handle a Stremio /subtitles request.
 *
 * Universal flow that respects up to 3 user-preferred languages (in the
 * order they were selected on /configure) and falls back gracefully:
 *
 *   1. Try each user language in priority order. Stop at the first one
 *      that has matching subtitles.
 *   2. If none of the user languages returned results, fall back to
 *      English (marked as "Fallback" in the UI label).
 *   3. If English is also missing, return an empty array (no placeholder).
 *
 * The chosen subtitle is converted to SRT on the fly (ASS/VTT/ZIP → SRT)
 * and served from our own /srt/<id>.srt endpoint so that Tizen 9 and any
 * other client without ASS/VTT support can display it with perfect timing.
 *
 * @param {object} args    - { id, type, extra }
 * @param {object} config  - Decoded user config (apiKeys, languages, _userAgent)
 * @param {string} baseUrl - Absolute base URL of this addon instance
 * @returns {Promise<{subtitles: Array}>}
 */
async function handleSubtitlesRequest(args, config, baseUrl) {
  const { id, type } = args;
  const parsed = parseStremioId(id);
  const userAgent = config._userAgent || '';

  // --- Resolve the search query (anime title, movie/series title) ---------
  let searchQuery = null;
  if (parsed.kitsuId) {
    searchQuery = await getKitsuTitle(parsed.kitsuId);
    log('info', `[Handler] Kitsu Anime detected. Title: ${searchQuery}`);
  } else if (parsed.imdbId) {
    searchQuery = await getCinemetaTitle(parsed.imdbId, type);
    log('info', `[Handler] IMDB ID: ${parsed.imdbId}. Cinemeta Title: ${searchQuery}`);
  }

  // --- Resolve requested languages (up to 3, in priority order) -----------
  // Default is English so the addon still works even if the user somehow
  // submits an empty language list.
  let requestedLangs = ['eng'];
  if (config.languages) {
    let langArray = [];
    if (Array.isArray(config.languages)) langArray = config.languages;
    else if (typeof config.languages === 'string') langArray = config.languages.split(',');
    const normalized = langArray.map(normalizeLanguage).filter(Boolean);
    if (normalized.length > 0) requestedLangs = normalized;
  }
  // Defensive cap — /configure already enforces max 3, but we re-cap here
  // so a hand-crafted URL can't blow up provider request sizes.
  if (requestedLangs.length > 3) requestedLangs = requestedLangs.slice(0, 3);
  log('info', `[Handler] Requested Languages (priority order): ${requestedLangs.join(' > ')}`);

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

  // --- Aggregate subtitles from all 5 providers ---------------------------
  const { subtitles } = await providerManager.searchAll(query);
  log('info', `[Handler] Found ${subtitles.length} total subtitles before filter.`);

  if (subtitles.length === 0) {
    log('warn', '[Handler] No subtitles from any provider. Returning empty.');
    return { subtitles: [] };
  }

  // --- Pick the best subtitle, respecting user priority order ------------
  let bestSub = null;
  let chosenLang = null;
  let isFallback = false;

  for (const lang of requestedLangs) {
    const matches = subtitles.filter(sub => normalizeLanguage(sub.language) === lang);
    if (matches.length > 0) {
      bestSub = matches[0];
      chosenLang = lang;
      log('info', `[Handler] Matched user language "${lang}" with ${matches.length} subtitle(s).`);
      break;
    }
  }

  // Fallback to English if the user's preferred languages didn't match
  // (and English is not already in the priority list).
  if (!bestSub && !requestedLangs.includes('eng')) {
    const enMatches = subtitles.filter(sub => normalizeLanguage(sub.language) === 'eng');
    if (enMatches.length > 0) {
      bestSub = enMatches[0];
      chosenLang = 'eng';
      isFallback = true;
      log('info', `[Handler] Falling back to English (${enMatches.length} available).`);
    }
  }

  // Last-resort: if nothing matched at all, return empty (no placeholder).
  if (!bestSub) {
    log('warn', `[Handler] No subtitles matched requested languages (${requestedLangs.join(',')}). Returning empty.`);
    return { subtitles: [] };
  }

  // --- Build the Stremio subtitle payload --------------------------------
  const langName = getLanguageName(chosenLang);
  const subName = `SubAlchemy [${langName}]${isFallback ? ' (Fallback)' : ''}`;

  try {
    let finalUrl = bestSub.url;

    // OpenSubtitles direct URL + official Stremio client: bypass conversion
    // and let the Stremio desktop client fetch the .gz/.srt directly via the
    // local 127.0.0.1:11470 bridge.
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

    // Any non-SRT subtitle (ASS/VTT/ZIP) or any non-Stremio client (e.g.
    // Tizen 9 native player) needs server-side conversion to plain SRT.
    if (bestSub.needsConversion || bestSub.format !== 'srt' || !isStremioClient(userAgent)) {
      const srtContent = await convertToSrt(bestSub);
      if (!srtContent) {
        log('warn', `[Handler] Conversion to SRT failed for ${bestSub.url}. Returning empty.`);
        return { subtitles: [] };
      }

      const subId = crypto.createHash('md5').update(bestSub.url).digest('hex').slice(0, 20);
      subtitleStore.set(subId, { content: srtContent, lang: bestSub.language });
      finalUrl = `${baseUrl}/srt/${subId}.srt`;
    }

    log('info', `[Handler] Returning 1 perfect SRT subtitle to Stremio (${langName}).`);
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