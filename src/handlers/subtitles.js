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

// v2.4.6: Strict sync thresholds
const SYNC_REJECT_OFFSET_MS = 60000;
const SYNC_HARD_REJECT_OFFSET_MS = 180000;
const DURATION_MIN_RATIO = 0.45;
const DURATION_MAX_RATIO = 1.30;

/**
 * v2.4.6: Detect episode match with STRICT patterns to prevent false positives.
 *
 * Previous bug (v2.4.5): patterns like /s0?1\s*e0?8/ would match the
 * substring "S01E08" inside a longer release name even when the actual
 * episode was different. This caused Spider-Noir S01E01 and S01E06+E07
 * batches to be marked as EXACT matches for S01E08.
 *
 * Fix: use anchored patterns that look for the season+episode as a
 * STANDALONE token (not inside another SxxExx pattern), and explicitly
 * reject releases that contain a DIFFERENT SxxExx marker.
 *
 * Returns:
 *   - 2  = exact match (S01E08 appears as standalone token)
 *   - 1  = no episode marker at all (might be batch or movie)
 *   - 0  = different episode marker found (definitely wrong)
 */
function episodeMatchScore(releaseName, fileName, season, episode) {
  if (season == null || episode == null) return 1;

  const hay = `${releaseName || ''} ${fileName || ''}`;
  const sStr = String(season);
  const eStr = String(episode);
  const eStrPadded = String(episode).padStart(2, '0');
  const sStrPadded = String(season).padStart(2, '0');

  // --- 1. Find ALL SxxExx patterns in the release name ---
  // Matches: S01E08, s1e8, S01E08, 1x08, S01.E08, etc.
  const allPatterns = /(?:s|S)?0?(\d{1,2})\s*[xXeE]\s*0?(\d{1,3})\b/g;
  const matches = [];
  let m;
  while ((m = allPatterns.exec(hay)) !== null) {
    matches.push({
      seasonFound: parseInt(m[1], 10),
      episodeFound: parseInt(m[2], 10),
      fullMatch: m[0],
    });
  }

  // --- 2. Also check "Episode 08" / "EP08" / "Ep. 08" ---
  const epLabelPattern = new RegExp(`\\b[eE][pP]\\.?\\s*0?${episode}\\b`);
  const hasEpLabel = epLabelPattern.test(hay);

  // --- 3. Check for fansub dash pattern: "Title - 08 [1080p]" ---
  // Only valid if the release is a single-episode (no SxxExx marker present)
  const dashPattern = new RegExp(`\\s-\\s0?${episode}\\s*\\[|\\s-\\s0?${episode}\\s*$|\\s-\\s0?${episode}\\s\\.`, 'i');
  const hasDashPattern = dashPattern.test(hay);

  // --- 4. Determine the result ---
  if (matches.length > 0) {
    // Look for an EXACT match: S{season}E{episode} as a standalone token
    const exactMatch = matches.find(mk =>
      mk.seasonFound === season && mk.episodeFound === episode
    );

    // If we found our SxxExx AND no other SxxExx markers exist → EXACT
    if (exactMatch && matches.length === 1) {
      return 2;
    }

    // If we found our SxxExx but there are OTHER SxxExx markers too →
    // this is a batch release containing multiple episodes.
    // Only count as EXACT if our episode is the FIRST one in the batch
    // (i.e., the release is named after the first episode).
    if (exactMatch) {
      // Sort by position in the release name (we already have them in order)
      const firstMatch = matches[0];
      if (firstMatch.seasonFound === season && firstMatch.episodeFound === episode) {
        return 2; // our episode is the first in the batch
      }
      // Our episode is in the batch but not the first one
      // → this sub will probably cover multiple episodes, not just ours
      return 0;
    }

    // We found SxxExx markers but NONE of them match our target episode
    // → definitely wrong episode
    return 0;
  }

  // No SxxExx marker found. Check for "Episode 08" or fansub dash.
  if (hasEpLabel || hasDashPattern) {
    return 2;
  }

  // No episode marker at all — neutral (might be movie or batch)
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
 * v2.5.1: Score with HARD penalty for wrong-episode subs.
 *
 * Previous bug (v2.5.0): episode match score was weighted ×100, but a
 * wrong-episode sub with score 0 could still outrank an exact-match sub
 * with score 2 if its duration/offset were slightly better. This caused
 * Spider-Noir S01E01 to be served when the user asked for S01E08.
 *
 * Fix:
 *   - episodeMatchScore=0 (wrong ep) gets a -10000 penalty (instant disqualify)
 *   - episodeMatchScore=2 (exact) gets +5000 bonus
 *   - episodeMatchScore=1 (neutral) gets 0
 * Then offset + duration + provider preferences apply as tiebreakers.
 */
function syncScore(sub, validation, expectedRuntimeSec, season, episode) {
  const epScore = episodeMatchScore(sub.releaseName, sub.fileName, season, episode);

  // v2.5.1: Hard penalty scale — episode match DOMINATES the score
  let epFinal;
  if (epScore === 2) epFinal = 5000;        // exact match — strong bonus
  else if (epScore === 1) epFinal = 0;       // neutral — no bonus
  else epFinal = -10000;                     // wrong episode — instant disqualify

  const offsetSec = validation.firstTimestampMs / 1000;
  const offsetScore = Math.max(-50, (60 - Math.abs(offsetSec)) / 60);

  let durScore = 1;
  if (expectedRuntimeSec && expectedRuntimeSec > 0) {
    const ratio = validation.durationMs / 1000 / expectedRuntimeSec;
    durScore = Math.max(0, 1 - Math.abs(1 - ratio));
    if (ratio > DURATION_MAX_RATIO) durScore = -0.5;
    if (ratio < DURATION_MIN_RATIO) durScore = -0.3;
  }

  const providerBonus = {
    opensubtitles: 0.3,
    animetosho: 0.2,
    subdl: 0.1,
    subsource: 0.0,
    wyzie: 0.0,
  }[sub.source] || 0;

  const releaseLower = (sub.releaseName || '').toLowerCase();
  let sdhPenalty = 0;
  if (releaseLower.includes('sdh') || releaseLower.includes('[sdh]')) sdhPenalty = -0.3;
  if (releaseLower.includes('hi') && releaseLower.match(/\bhi\b/)) sdhPenalty = -0.2;

  // v2.5.1: episode match dominates (×5000 bonus / -10000 penalty)
  // Other factors are tiebreakers among same-episode subs
  return epFinal + offsetScore * 30 + durScore * 20 + providerBonus + sdhPenalty;
}

/**
 * v2.5.1: Hard reject — should we even consider this candidate?
 *
 * v2.5.0 bug: didn't reject subs with episode match score = 0 (wrong ep).
 * Now rejects them outright — no point in scoring a sub that's definitely
 * the wrong episode.
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
  // v2.5.1: hard-reject wrong-episode subs
  if (season != null && episode != null) {
    const epScore = episodeMatchScore(sub.releaseName, sub.fileName, season, episode);
    if (epScore === 0) {
      // Build a debug string showing which SxxExx markers were found
      const hay = `${sub.releaseName || ''} ${sub.fileName || ''}`;
      const allPatterns = /(?:s|S)?0?(\d{1,2})\s*[xXeE]\s*0?(\d{1,3})\b/g;
      const found = [];
      let m;
      while ((m = allPatterns.exec(hay)) !== null) {
        found.push(`S${m[1]}E${m[2]}`);
      }
      return {
        reject: true,
        reason: `episode mismatch — requested S${season}E${episode}, release has ${found.join(', ') || 'no markers'}`
      };
    }
  }
  return { reject: false };
}

/**
 * Handle a Stremio /subtitles request.
 *
 * v2.5.1 flow:
 *   - Returns ONLY ONE subtitle — the best match across all candidates
 *   - Hard-rejects candidates that are obviously wrong BEFORE scoring,
 *     including wrong-episode subs (v2.5.0 bug)
 *   - Sync scoring heavily weights episode match (×5000 bonus,
 *     -10000 penalty) so a wrong-episode sub can NEVER outrank a
 *     correct-episode one, even with better offset/duration
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

  const { subtitles } = await providerManager.searchAll(query);
  log('info', `[Handler] Found ${subtitles.length} total subtitles before filter.`);

  if (subtitles.length === 0) {
    log('warn', '[Handler] No subtitles from any provider. Returning empty.');
    return { subtitles: [] };
  }

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

  const ranked = rankByEpisode(candidates, parsed.season, parsed.episode);
  if (parsed.season != null && parsed.episode != null) {
    log('info', `[Handler] Episode context: S${parsed.season}E${parsed.episode}. Ranking ${ranked.length} candidate(s) by episode-match score.`);
    ranked.slice(0, 10).forEach((c, i) => {
      const score = episodeMatchScore(c.releaseName, c.fileName, parsed.season, parsed.episode);
      const scoreLabel = score === 2 ? 'EXACT' : score === 1 ? 'neutral' : 'WRONG-EP';
      log('info', `[Handler]   #${i + 1} [${scoreLabel}] ${c.source} | ${c.language} | "${(c.releaseName || c.fileName || '').substring(0, 90)}"`);
    });
  }

  const validResults = [];
  let rejectedCount = 0;

  for (let i = 0; i < ranked.length; i++) {
    const sub = ranked[i];
    const langName = getLanguageName(normalizeLanguage(sub.language));

    try {
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

      const rejection = shouldHardReject(sub, validation, expectedRuntimeSec, parsed.season, parsed.episode);
      if (rejection.reject) {
        log('warn', `[Handler] Candidate ${i + 1} (${sub.source}) HARD-REJECTED: ${rejection.reason}. Skipping.`);
        rejectedCount++;
        continue;
      }

      const firstOffsetSec = Math.round(validation.firstTimestampMs / 1000);
      const totalDurationSec = Math.round(validation.durationMs / 1000);
      const score = syncScore(sub, validation, expectedRuntimeSec, parsed.season, parsed.episode);

      log('info', `[Handler] ✅ Valid #${validResults.length + 1} (candidate ${i + 1}/${ranked.length}, ${sub.source}, ${langName}, ${validation.cuesCount} cues, ${totalDurationSec}s, first @ ${firstOffsetSec}s, score=${score.toFixed(2)}) — release="${(sub.releaseName || '').substring(0, 90)}"`);

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
  log('info', `[Handler]    🏆 release="${(best.sub.releaseName || '').substring(0, 100)}"`);

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
