const { parseStremioId, isStremioClient } = require('../utils');
const { providerManager } = require('../providers');
const { convertToSrt } = require('../converters');
const { validateSrt } = require('../converters/validateSrt');
const subtitleStore = require('../cache/SubtitleStore');
const { getCinemetaTitle, getCinemetaMeta } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const { log } = require('../logger');
const { OS_DIRECT_URL_RE } = require('../constants');
const { normalizeLanguage, getLanguageName } = require('../utils/subtitleUtils');
const crypto = require('crypto');

const MAX_PER_LANG = 30;

// v2.4.6: Strict sync thresholds — we now return ONLY ONE subtitle (the
// best match), so we can afford to be pickier about what counts as
// "good enough" to surface to the user.
const SYNC_REJECT_OFFSET_MS = 60000;     // reject first cue > 60s
const SYNC_HARD_REJECT_OFFSET_MS = 180000; // > 3 min = definitely wrong release
const DURATION_MIN_RATIO = 0.45;          // sub < 45% of runtime = likely wrong
const DURATION_MAX_RATIO = 1.30;          // sub > 130% of runtime = batch / multi-ep

/**
 * Detect whether a subtitle's release name / file name matches the
 * requested season+episode. Returns:
 *   - 2  = exact match (e.g. "S01E11" or "1x11")
 *   - 1  = partial / no marker (might be a batch or movie)
 *   - 0  = different episode marker (definitely wrong episode)
 */
function episodeMatchScore(releaseName, fileName, season, episode) {
  if (season == null || episode == null) return 1;
  const hay = `${releaseName || ''} ${fileName || ''}`.toLowerCase();

  const eStr = String(episode);
  const eStrPadded = String(episode).padStart(2, '0');

  const exactPatterns = [
    new RegExp(`s0?${season}\\s*e0?${episode}\\b`, 'i'),
    new RegExp(`\\b${season}x0?${episode}\\b`, 'i'),
    new RegExp(`\\bep\\.?\\s*0?${episode}\\b`, 'i'),
    new RegExp(`\\bepisode\\s*0?${episode}\\b`, 'i'),
    new RegExp(`\\s-\\s${eStr}\\b`, 'i'),
    new RegExp(`\\s-\\s${eStrPadded}\\b`, 'i'),
  ];
  for (const re of exactPatterns) {
    if (re.test(hay)) return 2;
  }

  const anyEpisodeMarker = /\bs\d{1,2}\s*e\d{1,3}\b|\b\d+x\d{1,3}\b|\bep\.?\s*\d{1,3}\b|\s-\s\d{1,3}\b/i;
  const m = hay.match(anyEpisodeMarker);
  if (m) {
    const marker = m[0];
    if (!exactPatterns.some(re => re.test(marker))) {
      return 0;
    }
  }

  return 1;
}

/**
 * Sort candidates by episode match score (best first), preserving
 * language-priority order.
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
 * v2.5.0: Score a valid subtitle by sync quality.
 *
 * Combines:
 *   - episodeMatchScore (2 = exact, 1 = neutral, 0 = wrong ep)
 *   - first-cue offset (lower = better sync)
 *   - duration ratio vs. expected runtime from Cinemeta
 *
 * Returns a numeric score where higher = better.
 */
function syncScore(sub, validation, expectedRuntimeSec, season, episode) {
  const epScore = episodeMatchScore(sub.releaseName, sub.fileName, season, episode);
  const offsetSec = validation.firstTimestampMs / 1000;
  // Offset: 0s = perfect, decays linearly to 0 at 60s, then negative penalty
  const offsetScore = Math.max(-50, (60 - Math.abs(offsetSec)) / 60);

  let durScore = 1;
  if (expectedRuntimeSec && expectedRuntimeSec > 0) {
    const ratio = validation.durationMs / 1000 / expectedRuntimeSec;
    // Best at ratio ~1.0, penalize both directions
    durScore = Math.max(0, 1 - Math.abs(1 - ratio));
    // Heavy penalty for SDH batch (much longer than runtime)
    if (ratio > DURATION_MAX_RATIO) durScore = -0.5;
    if (ratio < DURATION_MIN_RATIO) durScore = -0.3;
  }

  // Provider preference: OpenSubtitles usually has the best episode-matched
  // subs; AnimeTosho is great for anime; SubDL/SubSource/Wyzie are variable.
  const providerBonus = {
    opensubtitles: 0.3,
    animetosho: 0.2,
    subdl: 0.1,
    subsource: 0.0,
    wyzie: 0.0,
  }[sub.source] || 0;

  // Release name signal: prefer non-SDH (subs without "[sdh]" / "sdh" tags
  // are cleaner — no brackets for sound effects)
  const releaseLower = (sub.releaseName || '').toLowerCase();
  let sdhPenalty = 0;
  if (releaseLower.includes('sdh') || releaseLower.includes('[sdh]')) sdhPenalty = -0.3;
  if (releaseLower.includes('hi') && releaseLower.match(/\bhi\b/)) sdhPenalty = -0.2; // "hearing impaired"

  // Weighted: episode match dominates (×100), offset ×30, duration ×20
  return epScore * 100 + offsetScore * 30 + durScore * 20 + providerBonus + sdhPenalty;
}

/**
 * v2.5.0: Hard reject — should we even consider this candidate?
 *
 * Rejects subs that are obviously wrong:
 *   - first cue starts > 3 min into the video (wrong release with recap)
 *   - duration < 45% of expected runtime (cut/cropped release)
 *   - duration > 130% of expected runtime (batch / multi-episode)
 *   - episode match score = 0 (different episode marker)
 */
function shouldHardReject(sub, validation, expectedRuntimeSec, season, episode) {
  if (validation.firstTimestampMs > SYNC_HARD_REJECT_OFFSET_MS) {
    return { reject: true, reason: `first cue @ ${Math.round(validation.firstTimestampMs / 1000)}s (too far)` };
  }
  if (expectedRuntimeSec && expectedRuntimeSec > 0) {
    const ratio = validation.durationMs / 1000 / expectedRuntimeSec;
    if (ratio < DURATION_MIN_RATIO) {
      return { reject: true, reason: `duration ratio ${ratio.toFixed(2)} < ${DURATION_MIN_RATIO} (too short)` };
    }
    if (ratio > DURATION_MAX_RATIO) {
      return { reject: true, reason: `duration ratio ${ratio.toFixed(2)} > ${DURATION_MAX_RATIO} (batch?)` };
    }
  }
  if (season != null && episode != null) {
    const epScore = episodeMatchScore(sub.releaseName, sub.fileName, season, episode);
    if (epScore === 0) {
      return { reject: true, reason: `episode marker mismatch (wrong episode)` };
    }
  }
  return { reject: false };
}

/**
 * Handle a Stremio /subtitles request.
 *
 * v2.5.0 flow changes:
 *   - Returns ONLY ONE subtitle — the best match across all candidates
 *     (was: up to 3 in v2.4.5). This avoids confusing the user with
 *     multiple options and prevents them from picking a desynced one.
 *   - Hard-rejects candidates that are obviously wrong before even
 *     attempting to score them.
 *   - Sync scoring combines episode match + first-cue offset + duration
 *     ratio + provider preference + SDH penalty to pick the best.
 */
async function handleSubtitlesRequest(args, config, baseUrl) {
  const { id, type } = args;
  const parsed = parseStremioId(id);
  const userAgent = config._userAgent || '';

  log('info', `[Handler] === Request start ===`);
  log('info', `[Handler] Stremio id: ${id}`);
  log('info', `[Handler] Parsed: imdbId=${parsed.imdbId || '-'}, kitsuId=${parsed.kitsuId || '-'}, season=${parsed.season ?? '-'}, episode=${parsed.episode ?? '-'}`);
  log('info', `[Handler] User-Agent: ${userAgent.substring(0, 80)}${userAgent.length > 80 ? '...' : ''}`);
  log('info', `[Handler] isStremioClient: ${isStremioClient(userAgent)}`);

  // --- Resolve search query + runtime ---
  let searchQuery = null;
  let expectedRuntimeSec = null;
  if (parsed.kitsuId) {
    searchQuery = await getKitsuTitle(parsed.kitsuId);
    log('info', `[Handler] Kitsu Anime detected. Title: ${searchQuery}`);
  } else if (parsed.imdbId) {
    const meta = await getCinemetaMeta(parsed.imdbId, type);
    searchQuery = meta?.name || null;
    expectedRuntimeSec = meta?.runtime ? meta.runtime * 60 : null;
    log('info', `[Handler] IMDB ID: ${parsed.imdbId}. Cinemeta Title: ${searchQuery}${expectedRuntimeSec ? `, runtime: ${meta.runtime}min (${expectedRuntimeSec}s)` : ''}`);
  }

  // --- Resolve requested languages ---
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

  // --- Log API keys (masked) ---
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

  // --- Aggregate subtitles from all 5 providers ---
  const { subtitles } = await providerManager.searchAll(query);
  log('info', `[Handler] Found ${subtitles.length} total subtitles before filter.`);

  if (subtitles.length === 0) {
    log('warn', '[Handler] No subtitles from any provider. Returning empty.');
    return { subtitles: [] };
  }

  // --- Build the ordered candidate list, respecting user priority ---
  const candidates = [];
  let chosenLang = null;
  let isFallback = false;

  function langMatches(subLang, requestedLang) {
    const subNorm = normalizeLanguage(subLang);
    if (requestedLang === 'pob') return subNorm === 'pob' || subNorm === 'por';
    if (requestedLang === 'ptg') return subNorm === 'ptg';
    if (requestedLang === 'por') return subNorm === 'pob' || subNorm === 'ptg' || subNorm === 'por';
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

  // --- Rank candidates by episode-match score ---
  const ranked = rankByEpisode(candidates, parsed.season, parsed.episode);
  if (parsed.season != null && parsed.episode != null) {
    log('info', `[Handler] Episode context: S${parsed.season}E${parsed.episode}. Ranking ${ranked.length} candidate(s) by episode-match score.`);
    ranked.slice(0, 5).forEach((c, i) => {
      const score = episodeMatchScore(c.releaseName, c.fileName, parsed.season, parsed.episode);
      const scoreLabel = score === 2 ? 'EXACT' : score === 1 ? 'neutral' : 'WRONG-EP';
      log('info', `[Handler]   #${i + 1} [${scoreLabel}] ${c.source} | ${c.language} | "${(c.releaseName || c.fileName || '').substring(0, 80)}"`);
    });
  }

  // --- v2.5.0: Iterate candidates, find THE best one ---
  // We validate every candidate, hard-reject obviously wrong ones, score
  // the rest, and return ONLY the highest-scoring one. This avoids
  // confusing the user with multiple subtitle options and prevents them
  // from picking a desynced one.
  const validResults = [];
  let rejectedCount = 0;

  for (let i = 0; i < ranked.length; i++) {
    const sub = ranked[i];
    const langName = getLanguageName(normalizeLanguage(sub.language));

    try {
      // OpenSubtitles direct URL + official Stremio desktop client:
      // bypass conversion. Only used for the FIRST candidate that
      // passes hard-rejection.
      if (OS_DIRECT_URL_RE.test(sub.url) && isStremioClient(userAgent) && validResults.length === 0) {
        log('info', `[Handler] Returning OS direct URL to Stremio desktop (candidate ${i + 1}/${ranked.length}, ${sub.source}, ${langName}). URL: ${sub.url.substring(0, 100)}`);
        return {
          subtitles: [{
            id: sub.id,
            url: `http://127.0.0.1:11470/subtitles.srt?from=${encodeURIComponent(sub.url)}`,
            lang: sub.language,
            name: `SubAlchemy [${langName}]${isFallback ? ' (Fallback)' : ''}`
          }]
        };
      }

      log('debug', `[Handler] Trying candidate ${i + 1}/${ranked.length}: ${sub.source} ${sub.format} (${langName}) | release="${(sub.releaseName || '').substring(0, 60)}" | file="${(sub.fileName || '').substring(0, 60)}" | url=${sub.url.substring(0, 80)}`);
      const srtContent = await convertToSrt(sub);
      if (!srtContent) {
        log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) failed conversion — trying next.`);
        continue;
      }

      const validation = validateSrt(srtContent);
      if (!validation.valid) {
        log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) produced invalid SRT (${validation.reason}, ${validation.cuesCount} cues, ${validation.durationMs}ms) — trying next.`);
        continue;
      }

      // v2.5.0: Hard reject — skip obviously wrong subs entirely
      const rejection = shouldHardReject(sub, validation, expectedRuntimeSec, parsed.season, parsed.episode);
      if (rejection.reject) {
        log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) HARD-REJECTED: ${rejection.reason}. Skipping.`);
        rejectedCount++;
        continue;
      }

      const firstOffsetSec = Math.round(validation.firstTimestampMs / 1000);
      const totalDurationSec = Math.round(validation.durationMs / 1000);
      const score = syncScore(sub, validation, expectedRuntimeSec, parsed.season, parsed.episode);

      log('info', `[Handler] ✅ Valid #${validResults.length + 1} (candidate ${i + 1}/${ranked.length}, ${sub.source}, ${langName}, ${validation.cuesCount} cues, ${totalDurationSec}s, first @ ${firstOffsetSec}s, score=${score.toFixed(2)}) — release="${(sub.releaseName || '').substring(0, 80)}"`);

      validResults.push({
        sub,
        srtContent,
        validation,
        score,
        langName,
      });
    } catch (e) {
      log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) threw: ${e.message} — trying next.`);
      continue;
    }
  }

  if (validResults.length === 0) {
    log('error', `[Handler] All ${ranked.length} candidates failed conversion/validation/hard-reject (${rejectedCount} hard-rejected). Returning empty.`);
    return { subtitles: [] };
  }

  // --- v2.5.0: Pick the BEST candidate by sync score ---
  validResults.sort((a, b) => b.score - a.score);
  const best = validResults[0];

  const firstOffsetSec = Math.round(best.validation.firstTimestampMs / 1000);
  const totalDurationSec = Math.round(best.validation.durationMs / 1000);
  const offsetLabel = firstOffsetSec === 0 ? '0s' : `${firstOffsetSec > 0 ? '+' : ''}${firstOffsetSec}s`;
  const subName = `SubAlchemy [${best.langName}]${isFallback ? ' (Fallback)' : ''}`;
  const subId = crypto.createHash('md5').update(best.sub.url).digest('hex').slice(0, 20);

  subtitleStore.set(subId, { content: best.srtContent, lang: best.sub.language });
  const finalUrl = `${baseUrl}/srt/${subId}.srt`;

  log('info', `[Handler] 🏆 Returning BEST subtitle to Stremio: ${best.sub.source} (${best.langName}, ${best.validation.cuesCount} cues, ${totalDurationSec}s, first @ ${firstOffsetSec}s, score=${best.score.toFixed(2)}). Skipped ${rejectedCount} hard-rejected, ${validResults.length - 1} lower-scored.`);

  return {
    subtitles: [{
      id: best.sub.id,
      url: finalUrl,
      lang: best.sub.language,
      name: subName,
    }]
  };
}

module.exports = { handleSubtitlesRequest };
