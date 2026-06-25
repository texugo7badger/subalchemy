const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt } = require('../converters');
const { validateSrt } = require('../converters/validateSrt');
const subtitleStore = require('../cache/SubtitleStore');
const { getCinemetaTitle, getCinemetaMeta } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const { log } = require('../logger');
const { OS_DIRECT_URL_RE } = require('../constants');
const { normalizeLanguage, getLanguageName, isBrazilianPortuguese } = require('../utils/subtitleUtils');
const crypto = require('crypto');

const MAX_PER_LANG = 30;
const TOP_N_VALID = 3;          // v2.4.5: return up to 3 valid candidates
const SYNC_REJECT_OFFSET_MS = 60000;  // reject subs whose first cue starts >60s

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
  const anyEpisodeMarker = /\bs\d{1,2}\s*e\d{1,3}\b|\b\d+x\d{1,3}\b|\bep\.?\s*\d{1,3}\b|\s-\s\d{1,3}\b/i;
  const m = hay.match(anyEpisodeMarker);
  if (m) {
    const marker = m[0];
    if (!exactPatterns.some(re => re.test(marker))) {
      return 0; // different episode
    }
  }

  return 1;
}

/**
 * Sort candidates by episode match score (best first), preserving
 * language-priority order.
 *
 * @param {Array} candidates - Already built in language-priority order
 * @param {number|null} season
 * @param {number|null} episode
 * @returns {Array} Sorted copy
 */
function rankByEpisode(candidates, season, episode) {
  if (season == null || episode == null) return candidates;

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
      return sb - sa;
    });
    out.push(...group);
  }
  return out;
}

/**
 * v2.4.5: Score a valid subtitle by sync quality.
 *
 * Combines:
 *   - episodeMatchScore (2 = exact, 1 = neutral, 0 = wrong ep)
 *   - first-cue offset (lower absolute value = better sync; a sub whose
 *     first cue starts at 0s matches most streams, while one starting at
 *     30s suggests a release with extended recap the stream may not have)
 *   - duration ratio vs. expected runtime (when available from Cinemeta);
 *     subs much shorter than the runtime are likely cut/cropped releases
 *
 * Returns a numeric score where higher = better sync.
 *
 * @param {object} sub
 * @param {object} validation - From validateSrt()
 * @param {number|null} expectedRuntimeSec - From Cinemeta (null if unknown)
 * @param {number|null} season
 * @param {number|null} episode
 * @returns {number}
 */
function syncScore(sub, validation, expectedRuntimeSec, season, episode) {
  const epScore = episodeMatchScore(sub.releaseName, sub.fileName, season, episode);
  // Offset penalty: 0s = perfect, 60s = 0 (rejected separately, but score reflects)
  const offsetSec = validation.firstTimestampMs / 1000;
  const offsetScore = Math.max(0, 60 - Math.abs(offsetSec)) / 60; // 0..1
  // Duration ratio: 1.0 = perfect, 0.5 = half-length (cropped)
  let durScore = 1;
  if (expectedRuntimeSec && expectedRuntimeSec > 0) {
    const ratio = validation.durationMs / 1000 / expectedRuntimeSec;
    // Best at ratio ~1.0, penalize both directions
    durScore = Math.max(0, 1 - Math.abs(1 - ratio));
  }
  // Weighted: episode match dominates, then offset, then duration
  return epScore * 100 + offsetScore * 30 + durScore * 20;
}

/**
 * Handle a Stremio /subtitles request.
 *
 * v2.4.5 flow changes:
 *   - Returns up to 3 valid candidates (one per preferred source when
 *     possible) so the user can switch in real-time if one is desynced.
 *   - Each candidate is labeled with platform + first-cue offset:
 *     "SubAlchemy [Portuguese (Brazil)] · OpenSubtitles · off +2s"
 *   - Subs whose first cue starts >60s are rejected (likely wrong release).
 *   - Sync scoring ranks the 3 candidates so the best appears first in
 *     Stremio's list (which the user usually picks by default).
 *   - PT-BR vs PT-PT: respects user variant explicitly. 'pob' matches
 *     'pob' + 'por' (generic), but never auto-promotes 'ptg'.
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

  // --- Resolve search query + runtime (Cinemeta now returns both) --------
  let searchQuery = null;
  let expectedRuntimeSec = null;
  if (parsed.kitsuId) {
    searchQuery = await getKitsuTitle(parsed.kitsuId);
    log('info', `[Handler] Kitsu Anime detected. Title: ${searchQuery}`);
  } else if (parsed.imdbId) {
    const meta = await getCinemetaMeta(parsed.imdbId, type);
    searchQuery = meta?.name || null;
    expectedRuntimeSec = meta?.runtime || null;
    log('info', `[Handler] IMDB ID: ${parsed.imdbId}. Cinemeta Title: ${searchQuery}${expectedRuntimeSec ? `, runtime: ${expectedRuntimeSec}min` : ''}`);
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
  // v2.4.5: Portuguese variant handling. When the user requested 'pob'
  // (Brazil), we accept 'pob' first, then 'por' (generic) as fallback.
  // We never auto-promote 'ptg' (Portugal) to satisfy a 'pob' request.
  // When the user requested 'ptg', we accept only 'ptg'.
  // When the user requested 'por' (generic), we accept all three variants.
  const candidates = [];
  let chosenLang = null;
  let isFallback = false;

  function langMatches(subLang, requestedLang) {
    const subNorm = normalizeLanguage(subLang);
    if (requestedLang === 'pob') {
      // Brazil: accept explicit pob AND generic por (most providers
      // default to pob under 'por'). Reject ptg (Portugal).
      return subNorm === 'pob' || subNorm === 'por';
    }
    if (requestedLang === 'ptg') {
      // Portugal: strict — only explicit ptg.
      return subNorm === 'ptg';
    }
    if (requestedLang === 'por') {
      // Generic: accept any Portuguese variant.
      return subNorm === 'pob' || subNorm === 'ptg' || subNorm === 'por';
    }
    return subNorm === requestedLang;
  }

  for (const lang of requestedLangs) {
    const matches = subtitles
      .filter(sub => langMatches(sub.language, lang))
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
  const ranked = rankByEpisode(candidates, parsed.season, parsed.episode);
  if (parsed.season != null && parsed.episode != null) {
    log('info', `[Handler] Episode context: S${parsed.season}E${parsed.episode}. Ranking ${ranked.length} candidate(s) by episode-match score.`);
    ranked.slice(0, 5).forEach((c, i) => {
      const score = episodeMatchScore(c.releaseName, c.fileName, parsed.season, parsed.episode);
      const scoreLabel = score === 2 ? 'EXACT' : score === 1 ? 'neutral' : 'WRONG-EP';
      log('info', `[Handler]   #${i + 1} [${scoreLabel}] ${c.source} | ${c.language} | "${(c.releaseName || c.fileName || '').substring(0, 80)}"`);
    });
  }

  // --- v2.4.5: Collect up to TOP_N_VALID candidates, validating each ------
  // Returns multiple entries so the user can switch in Stremio's subtitle
  // picker if the top pick is desynced. Each is labeled with platform +
  // first-cue offset for visual sync calibration.
  const validResults = [];

  for (let i = 0; i < ranked.length && validResults.length < TOP_N_VALID; i++) {
    const sub = ranked[i];
    const langName = getLanguageName(normalizeLanguage(sub.language));

    try {
      // OpenSubtitles direct URL + official Stremio desktop client:
      // bypass conversion. Only used for the FIRST candidate (otherwise
      // we'd be sending multiple direct OS URLs which Stremio doesn't
      // list meaningfully).
      if (OS_DIRECT_URL_RE.test(sub.url) && isStremioClient(userAgent) && validResults.length === 0) {
        log('info', `[Handler] Returning OS direct URL to Stremio desktop (candidate ${i + 1}/${ranked.length}, ${sub.source}, ${langName}). URL: ${sub.url.substring(0, 100)}`);
        return {
          subtitles: [{
            id: sub.id,
            url: `http://127.0.0.1:11470/subtitles.srt?from=${encodeURIComponent(sub.url)}`,
            lang: sub.language,
            name: `SubAlchemy [${langName}] · ${sub.source}${isFallback ? ' · Fallback' : ''}`
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

      // v2.4.5: Reject subs whose first cue starts >60s — likely a
      // release with extended recap the stream doesn't have.
      if (validation.firstTimestampMs > SYNC_REJECT_OFFSET_MS) {
        log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) rejected — first cue at ${Math.round(validation.firstTimestampMs / 1000)}s (sync drift >${SYNC_REJECT_OFFSET_MS / 1000}s). Trying next.`);
        continue;
      }

      const subId = crypto.createHash('md5').update(sub.url).digest('hex').slice(0, 20);
      subtitleStore.set(subId, { content: srtContent, lang: sub.language });
      const finalUrl = `${baseUrl}/srt/${subId}.srt`;

      const firstOffsetSec = Math.round(validation.firstTimestampMs / 1000);
      const totalDurationSec = Math.round(validation.durationMs / 1000);
      const offsetLabel = firstOffsetSec === 0 ? 'off 0s' : `off ${firstOffsetSec > 0 ? '+' : ''}${firstOffsetSec}s`;
      const subName = `SubAlchemy [${langName}] · ${sub.source} · ${offsetLabel}${isFallback ? ' · Fallback' : ''}`;

      log('info', `[Handler] ✅ Valid #${validResults.length + 1} (candidate ${i + 1}/${ranked.length}, ${sub.source}, ${langName}, ${validation.cuesCount} cues, ${totalDurationSec}s, first @ ${firstOffsetSec}s) — release="${(sub.releaseName || '').substring(0, 80)}"`);

      validResults.push({
        sub,
        subId,
        finalUrl,
        subName,
        langName,
        validation,
        episodeScore: episodeMatchScore(sub.releaseName, sub.fileName, parsed.season, parsed.episode),
      });
    } catch (e) {
      log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) threw: ${e.message} — trying next.`);
      continue;
    }
  }

  if (validResults.length === 0) {
    log('error', `[Handler] All ${ranked.length} candidates failed conversion or validation. Returning empty.`);
    return { subtitles: [] };
  }

  // --- v2.4.5: Sort the valid candidates by sync score (best first) ------
  validResults.sort((a, b) => {
    const sa = syncScore(a.sub, a.validation, expectedRuntimeSec, parsed.season, parsed.episode);
    const sb = syncScore(b.sub, b.validation, expectedRuntimeSec, parsed.season, parsed.episode);
    return sb - sa;
  });

  log('info', `[Handler] Returning ${validResults.length} synced candidate(s) to Stremio. Top: ${validResults[0].sub.source} @ off ${Math.round(validResults[0].validation.firstTimestampMs / 1000)}s.`);

  return {
    subtitles: validResults.map(r => ({
      id: r.sub.id,
      url: r.finalUrl,
      lang: r.sub.language,
      name: r.subName,
    }))
  };
}

module.exports = { handleSubtitlesRequest };
