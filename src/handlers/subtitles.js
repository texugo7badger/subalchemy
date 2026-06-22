const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt } = require('../converters');
const { validateSrt } = require('../converters/validateSrt');
const subtitleStore = require('../cache/SubtitleStore');
const { getCinemetaTitle } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const { log } = require('../logger');
const { OS_DIRECT_URL_RE } = require('../constants');
const { normalizeLanguage, getLanguageName } = require('../utils/subtitleUtils');
const crypto = require('crypto');

const MAX_PER_LANG = 30;

/**
 * Detect whether a subtitle's release name / file name matches the
 * requested season+episode. Returns:
 *   - 2  = exact match (e.g. "S01E11" or "1x11")
 *   - 1  = partial / no marker (might be a batch or movie)
 *   - 0  = different episode marker (definitely wrong episode)
 *
 * @param {string} releaseName
 * @param {string} fileName
 * @param {number|null} season
 * @param {number|null} episode
 * @returns {number}
 */
function episodeMatchScore(releaseName, fileName, season, episode) {
  if (season == null || episode == null) return 1; // no episode requested — neutral
  const hay = `${releaseName || ''} ${fileName || ''}`.toLowerCase();

  // Common episode markers (case-insensitive):
  //   S01E11, s1e11, 1x11         — standard TV naming
  //   EP11, ep.11, episode 11     — explicit episode label
  //   " - 11 " or " - 11["        — fansub naming (e.g. "[Erai-raws] Title - 11 [1080p]")
  const eStr = String(episode);
  const eStrPadded = String(episode).padStart(2, '0');

  const exactPatterns = [
    // Standard TV patterns
    new RegExp(`s0?${season}\\s*e0?${episode}\\b`, 'i'),
    new RegExp(`\\b${season}x0?${episode}\\b`, 'i'),
    // Explicit episode label
    new RegExp(`\\bep\\.?\\s*0?${episode}\\b`, 'i'),
    new RegExp(`\\bepisode\\s*0?${episode}\\b`, 'i'),
    // Fansub pattern: " - 11 " or " - 11[" or " - 11." at end of name segment
    new RegExp(`\\s-\\s${eStr}\\b`, 'i'),
    new RegExp(`\\s-\\s${eStrPadded}\\b`, 'i'),
  ];
  for (const re of exactPatterns) {
    if (re.test(hay)) return 2;
  }

  // Try to detect any episode marker that DOESN'T match — that's a miss.
  // We use the standard TV pattern + fansub dash pattern for detection.
  const anyEpisodeMarker = /\bs\d{1,2}\s*e\d{1,3}\b|\b\d+x\d{1,3}\b|\bep\.?\s*\d{1,3}\b|\s-\s\d{1,3}\b/i;
  const m = hay.match(anyEpisodeMarker);
  if (m) {
    // Found a marker — does it match our target episode?
    const marker = m[0];
    if (!exactPatterns.some(re => re.test(marker))) {
      return 0; // different episode
    }
  }

  // No marker at all — might be a batch, movie, or episode-less sub. Neutral.
  return 1;
}

/**
 * Sort candidates by episode match score (best first), preserving
 * language-priority order. Within the same language, candidates with
 * score 2 (exact match) come first, then score 1 (neutral), then 0 (miss).
 *
 * @param {Array} candidates - Already built in language-priority order
 * @param {number|null} season
 * @param {number|null} episode
 * @returns {Array} Sorted copy
 */
function rankByEpisode(candidates, season, episode) {
  if (season == null || episode == null) return candidates;

  // Group by language, sort within each group, then flatten back.
  // We need to preserve the language-priority order from `candidates`.
  const langGroups = new Map();
  for (const sub of candidates) {
    const lang = normalizeLanguage(sub.language) || 'eng';
    if (!langGroups.has(lang)) langGroups.set(lang, []);
    langGroups.get(lang).push(sub);
  }

  const out = [];
  for (const group of langGroups.values()) {
    group.sort((a, b) => {
      const sa = episodeMatchScore(a.releaseName, a.fileName, season, episode);
      const sb = episodeMatchScore(b.releaseName, b.fileName, season, episode);
      return sb - sa; // higher score first
    });
    out.push(...group);
  }
  return out;
}

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
 * For the chosen language, candidates are ranked by episode-match score
 * (so S01E11 subs come before batch/wrong-episode subs), and iterated
 * until one converts to a valid SRT (passes `validateSrt()`).
 */
async function handleSubtitlesRequest(args, config, baseUrl) {
  const { id, type } = args;
  const parsed = parseStremioId(id);
  const userAgent = config._userAgent || '';

  // --- Log the full request context (calibration aid) --------------------
  log('info', `[Handler] === Request start ===`);
  log('info', `[Handler] Stremio id: ${id}`);
  log('info', `[Handler] Parsed: imdbId=${parsed.imdbId || '-'}, kitsuId=${parsed.kitsuId || '-'}, season=${parsed.season ?? '-'}, episode=${parsed.episode ?? '-'}`);
  log('info', `[Handler] User-Agent: ${userAgent.substring(0, 80)}${userAgent.length > 80 ? '...' : ''}`);
  log('info', `[Handler] isStremioClient: ${isStremioClient(userAgent)}`);

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

  // --- Log API keys (masked) ---------------------------------------------
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

  // --- Rank candidates by episode-match score -----------------------------
  // When the user requested a specific episode, sort so that exact-episode
  // matches come first, then neutral (no marker), then wrong-episode.
  const ranked = rankByEpisode(candidates, parsed.season, parsed.episode);
  if (parsed.season != null && parsed.episode != null) {
    log('info', `[Handler] Episode context: S${parsed.season}E${parsed.episode}. Ranking ${ranked.length} candidate(s) by episode-match score.`);
    // Log top 5 candidates with their score for calibration
    ranked.slice(0, 5).forEach((c, i) => {
      const score = episodeMatchScore(c.releaseName, c.fileName, parsed.season, parsed.episode);
      const scoreLabel = score === 2 ? 'EXACT' : score === 1 ? 'neutral' : 'WRONG-EP';
      log('info', `[Handler]   #${i + 1} [${scoreLabel}] ${c.source} | ${c.language} | "${(c.releaseName || c.fileName || '').substring(0, 80)}"`);
    });
  }

  // --- Iterate candidates: convert + validate each until one works --------
  for (let i = 0; i < ranked.length; i++) {
    const sub = ranked[i];
    const langName = getLanguageName(normalizeLanguage(sub.language));
    const subName = `SubAlchemy [${langName}]${isFallback ? ' (Fallback)' : ''}`;

    try {
      let finalUrl = sub.url;

      // OpenSubtitles direct URL + official Stremio desktop client:
      // bypass conversion, let Stremio fetch the .gz/.srt directly via the
      // local 127.0.0.1:11470 bridge.
      if (OS_DIRECT_URL_RE.test(sub.url) && isStremioClient(userAgent)) {
        log('info', `[Handler] Returning OS direct URL to Stremio desktop (candidate ${i + 1}/${ranked.length}, ${sub.source}, ${langName}). URL: ${sub.url.substring(0, 100)}`);
        return {
          subtitles: [{
            id: sub.id,
            url: `http://127.0.0.1:11470/subtitles.srt?from=${encodeURIComponent(sub.url)}`,
            lang: sub.language,
            name: subName
          }]
        };
      }

      // Convert to SRT (handles ASS/VTT/ZIP/XZ/GZ)
      log('debug', `[Handler] Trying candidate ${i + 1}/${ranked.length}: ${sub.source} ${sub.format} (${langName}) | release="${(sub.releaseName || '').substring(0, 60)}" | file="${(sub.fileName || '').substring(0, 60)}" | url=${sub.url.substring(0, 80)}`);
      const srtContent = await convertToSrt(sub);
      if (!srtContent) {
        log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) failed conversion — trying next.`);
        continue;
      }

      // Validate the SRT — reject placeholder/empty/broken subs
      const validation = validateSrt(srtContent);
      if (!validation.valid) {
        log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) produced invalid SRT (${validation.reason}, ${validation.cuesCount} cues, ${validation.durationMs}ms) — trying next.`);
        continue;
      }

      const subId = crypto.createHash('md5').update(sub.url).digest('hex').slice(0, 20);
      subtitleStore.set(subId, { content: srtContent, lang: sub.language });
      finalUrl = `${baseUrl}/srt/${subId}.srt`;

      // Log sync-relevant info: first cue offset, last cue end. If the first
      // cue starts > 30s into the video, the subtitle is likely for a
      // release that includes an opening the user's stream doesn't have
      // (or vice versa). We still serve it but log a WARN so we can diagnose
      // "subtitle doesn't appear" reports.
      const firstOffsetSec = Math.round(validation.firstTimestampMs / 1000);
      const totalDurationSec = Math.round(validation.durationMs / 1000);
      const syncWarning = firstOffsetSec > 30 ? ' ⚠️ first cue starts at ' + firstOffsetSec + 's — may be desynced if stream cuts opening' : '';
      log('info', `[Handler] ✅ Returning converted SRT to Stremio (candidate ${i + 1}/${ranked.length}, ${sub.source}, ${langName}, ${validation.cuesCount} cues, ${totalDurationSec}s duration, first cue @ ${firstOffsetSec}s${syncWarning})`);
      log('info', `[Handler]    release="${(sub.releaseName || '').substring(0, 80)}" file="${(sub.fileName || '').substring(0, 80)}"`);
      log('info', `[Handler]    served at ${finalUrl}`);
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

  log('error', `[Handler] All ${ranked.length} candidates failed conversion or validation. Returning empty.`);
  return { subtitles: [] };
}

module.exports = { handleSubtitlesRequest };