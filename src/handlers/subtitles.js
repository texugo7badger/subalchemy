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
 * For the chosen language, iterate through all candidates in order until
 * one of them converts to SRT successfully. This is critical because the
 * first candidate (often OpenSubtitles) can fail at download time with
 * HTTP 401 — without iteration the user would get no subtitle at all
 * despite 100+ alternatives being available from AnimeTosho/SubSource/etc.
 *
 * The chosen subtitle is converted to SRT on the fly (ASS/VTT/ZIP/gz → SRT)
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
  let requestedLangs = ['eng'];
  if (config.languages) {
    let langArray = [];
    if (Array.isArray(config.languages)) langArray = config.languages;
    else if (typeof config.languages === 'string') langArray = config.languages.split(',');
    const normalized = langArray.map(normalizeLanguage).filter(Boolean);
    if (normalized.length > 0) requestedLangs = normalized;
  }
  if (requestedLangs.length > 3) requestedLangs = requestedLangs.slice(0, 3);
  log('info', `[Handler] Requested Languages (priority order): ${requestedLangs.join(' > ')}`);

  // --- Debug: log what API keys actually arrived (masked) -----------------
  // This is critical for diagnosing "No API key configured" warnings that
  // happen despite the user having typed a key in /configure.
  const apiKeys = {
    subdlApiKey: config.subdlApiKey ? `(set, ${config.subdlApiKey.length} chars)` : '(missing)',
    subsourceApiKey: config.subsourceApiKey ? `(set, ${config.subsourceApiKey.length} chars)` : '(missing)',
    wyzieApiKey: config.wyzieApiKey ? `(set, ${config.wyzieApiKey.length} chars)` : '(missing)',
  };
  log('info', `[Handler] API keys: ${JSON.stringify(apiKeys)}`);

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

  // --- Build the ordered candidate list, respecting user priority ---------
  // We collect ALL matching subs across all user-requested languages (in
  // priority order) so that if the first candidate fails to convert, we
  // can fall through to the next one. We cap at 30 candidates per language
  // to bound the worst-case conversion time.
  const MAX_PER_LANG = 30;
  const candidates = [];
  let chosenLang = null;
  let isFallback = false;

  for (const lang of requestedLangs) {
    const matches = subtitles
      .filter(sub => normalizeLanguage(sub.language) === lang)
      .slice(0, MAX_PER_LANG);
    if (matches.length > 0) {
      candidates.push(...matches);
      if (!chosenLang) {
        chosenLang = lang;
        log('info', `[Handler] Primary language "${lang}" — ${matches.length} candidate(s).`);
      }
    }
  }

  // Fallback to English if no user language matched
  if (candidates.length === 0 && !requestedLangs.includes('eng')) {
    const enMatches = subtitles
      .filter(sub => normalizeLanguage(sub.language) === 'eng')
      .slice(0, MAX_PER_LANG);
    if (enMatches.length > 0) {
      candidates.push(...enMatches);
      chosenLang = 'eng';
      isFallback = true;
      log('info', `[Handler] Falling back to English — ${enMatches.length} candidate(s).`);
    }
  }

  if (candidates.length === 0) {
    log('warn', `[Handler] No subtitles matched requested languages (${requestedLangs.join(',')}). Returning empty.`);
    return { subtitles: [] };
  }

  // --- Iterate candidates: convert each to SRT until one works ------------
  // OpenSubtitles .gz URLs frequently 401 at download time (the search API
  // returns a SubDownloadLink that is short-lived). AnimeTosho ASS files
  // always work. By iterating we surface the AnimeTosho fallback instead
  // of failing silently.
  for (let i = 0; i < candidates.length; i++) {
    const sub = candidates[i];
    const langName = getLanguageName(normalizeLanguage(sub.language));
    const subName = `SubAlchemy [${langName}]${isFallback ? ' (Fallback)' : ''}`;

    try {
      let finalUrl = sub.url;

      // OpenSubtitles direct URL + official Stremio desktop client:
      // bypass conversion, let Stremio fetch the .gz/.srt directly via the
      // local 127.0.0.1:11470 bridge. (Tizen 9 doesn't get this path because
      // its User-Agent isn't matched by STREMIO_UA_RE.)
      if (OS_DIRECT_URL_RE.test(sub.url) && isStremioClient(userAgent)) {
        log('info', `[Handler] Returning OS direct URL to Stremio desktop client (candidate ${i + 1}/${candidates.length}, ${langName}).`);
        return {
          subtitles: [{
            id: sub.id,
            url: `http://127.0.0.1:11470/subtitles.srt?from=${encodeURIComponent(sub.url)}`,
            lang: sub.language,
            name: subName
          }]
        };
      }

      // Any non-SRT subtitle (ASS/VTT/ZIP/gz) or any non-Stremio client
      // (Tizen 9, browser, etc.) needs server-side conversion to plain SRT.
      if (sub.needsConversion || sub.format !== 'srt' || !isStremioClient(userAgent)) {
        log('debug', `[Handler] Trying candidate ${i + 1}/${candidates.length}: ${sub.source} ${sub.format} (${langName})`);
        const srtContent = await convertToSrt(sub);
        if (!srtContent) {
          log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) failed conversion — trying next.`);
          continue;
        }

        const subId = crypto.createHash('md5').update(sub.url).digest('hex').slice(0, 20);
        subtitleStore.set(subId, { content: srtContent, lang: sub.language });
        finalUrl = `${baseUrl}/srt/${subId}.srt`;
        log('info', `[Handler] Returning converted SRT to Stremio (candidate ${i + 1}/${candidates.length}, ${sub.source}, ${langName}).`);
        return {
          subtitles: [{
            id: sub.id,
            url: finalUrl,
            lang: sub.language,
            name: subName
          }]
        };
      }

      // Pure SRT, no conversion needed (rare for non-Stremio clients)
      log('info', `[Handler] Returning direct SRT URL (candidate ${i + 1}, ${langName}).`);
      return {
        subtitles: [{
          id: sub.id,
          url: finalUrl,
          lang: sub.language,
          name: subName
        }]
      };
    } catch (e) {
      log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) threw: ${e.message} — trying next.`);
      continue;
    }
  }

  log('error', `[Handler] All ${candidates.length} candidates failed conversion. Returning empty.`);
  return { subtitles: [] };
}

module.exports = { handleSubtitlesRequest };