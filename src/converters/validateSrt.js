/**
 * Validate that an SRT string is well-formed and usable.
 *
 * Used by the handler to reject empty/broken/placeholder subtitles before
 * serving them to Stremio. Catches problems like:
 *   - Placeholder SRTs with no real cues (just a "no subtitle" message)
 *   - Conversion failures that produced a single empty cue
 *   - Wrong-release subs that have a single cue spanning 0ms
 *
 * @param {string} srtContent
 * @returns {{
 *   valid: boolean,
 *   cuesCount: number,
 *   firstTimestampMs: number,
 *   lastTimestampMs: number,
 *   durationMs: number,
 *   reason: string|null
 * }}
 */
function validateSrt(srtContent) {
  if (!srtContent || typeof srtContent !== 'string') {
    return { valid: false, cuesCount: 0, firstTimestampMs: 0, lastTimestampMs: 0, durationMs: 0, reason: 'empty-content' };
  }

  // Match all SRT timestamp lines: HH:MM:SS,mmm --> HH:MM:SS,mmm
  const timestampRe = /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/g;
  const matches = [...srtContent.matchAll(timestampRe)];

  if (matches.length === 0) {
    return { valid: false, cuesCount: 0, firstTimestampMs: 0, lastTimestampMs: 0, durationMs: 0, reason: 'no-timestamps' };
  }

  const cuesCount = matches.length;
  const firstStart = parseSrtTimestamp(matches[0][1]);
  const lastEnd = parseSrtTimestamp(matches[matches.length - 1][2]);
  const durationMs = lastEnd - firstStart;

  // Reject if too few cues (likely placeholder/broken)
  if (cuesCount < 3) {
    return { valid: false, cuesCount, firstTimestampMs: firstStart, lastTimestampMs: lastEnd, durationMs, reason: 'too-few-cues' };
  }

  // Reject if duration is 0 or negative (single broken cue)
  if (durationMs <= 0) {
    return { valid: false, cuesCount, firstTimestampMs: firstStart, lastTimestampMs: lastEnd, durationMs, reason: 'zero-duration' };
  }

  // Reject if total duration exceeds 6 hours (likely wrong subtitle matched
  // to a short video, or a multi-episode batch sub). Most movies/anime are
  // < 3h, so 6h is a generous upper bound.
  if (durationMs > 6 * 60 * 60 * 1000) {
    return { valid: false, cuesCount, firstTimestampMs: firstStart, lastTimestampMs: lastEnd, durationMs, reason: 'suspicious-duration' };
  }

  return { valid: true, cuesCount, firstTimestampMs: firstStart, lastTimestampMs: lastEnd, durationMs, reason: null };
}

/**
 * Parse an SRT timestamp (HH:MM:SS,mmm or HH:MM:SS.mmm) into milliseconds.
 * @param {string} ts
 * @returns {number}
 */
function parseSrtTimestamp(ts) {
  const m = ts.replace(',', '.').match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!m) return 0;
  const [, h, mm, s, ms] = m;
  return (parseInt(h, 10) * 3600 + parseInt(mm, 10) * 60 + parseInt(s, 10)) * 1000 + parseInt(ms, 10);
}

module.exports = { validateSrt, parseSrtTimestamp };