/**
 * v2.4.6: Convert WebVTT to SRT with proper cleanup.
 *
 * PROBLEMS THIS FIXES (reported by users):
 *
 * 1. VTT cue timestamps inside text:
 *      "<00:00:01.234>Hello <00:00:02.500>world"
 *      → "Hello world" (timestamps stripped, text joined)
 *
 * 2. VTT inline HTML tags:
 *      "<i>Hello</i>"        → "Hello"
 *      "<b>Bold</b>"         → "Bold"
 *      "<u>Underline</u>"    → "Underline"
 *      "<c.red>Red text</c>" → "Red text"
 *      "<v John>Hi!"         → "Hi!" (voice tag + speaker label stripped)
 *      "<lang es>Hola</lang>"→ "Hola"
 *
 * 3. VTT NOTE blocks (comments):
 *      NOTE This is a comment
 *      → removed entirely
 *
 * 4. VTT STYLE blocks:
 *      ::cue(...) { color: white; }
 *      → removed entirely
 *
 * 5. VTT REGION blocks:
 *      region: id=foo width=40%
 *      → removed entirely
 *
 * 6. Timestamp format:
 *      00:00:01.000 → 00:00:01,000 (dot → comma for SRT)
 *
 * STRATEGY:
 *   - Strip NOTE / STYLE / REGION blocks first
 *   - Strip inline HTML tags and VTT cue timestamps
 *   - Strip voice tags <v Speaker> which is VTT's speaker-label format
 *   - Convert timestamp separators (.) → (,)
 *   - Drop cue index numbers (VTT has them optional, SRT requires them
 *     but we'll renumber downstream)
 */
function convertVttToSrt(vttContent) {
  if (!vttContent || typeof vttContent !== 'string') return null;

  try {
    let out = vttContent;

    // --- Normalize line endings ---
    out = out.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // --- Strip NOTE blocks ---
    // NOTE
    //   This is a comment
    //   Multi-line
    //
    // Ends at a blank line.
    out = out.replace(/^NOTE[^\n]*(\n[^\n]*)*\n\n/gim, '');

    // --- Strip STYLE blocks ---
    out = out.replace(/^STYLE[^\n]*\n(.*\n)*?\n/gim, '');

    // --- Strip REGION blocks ---
    out = out.replace(/^REGION[^\n]*\n(.*\n)*?\n/gim, '');

    // --- Strip WEBVTT header line + any metadata ---
    out = out.replace(/^WEBVTT[^\n]*\n+/i, '');

    // --- Strip cue identifiers (optional in VTT, before timecode) ---
    // Pattern: a line that's NOT a timecode, followed by a timecode line
    // Example:
    //   cue-1
    //   00:00:01.000 --> 00:00:03.000
    //   Hello
    // →
    //   00:00:01.000 --> 00:00:03.000
    //   Hello
    out = out.split('\n').filter((line, index, arr) => {
      // If this line is a cue identifier (not a timecode, not a number,
      // not text), AND the next line is a timecode, drop it.
      const next = arr[index + 1] || '';
      const isTimecodeNext = /-->/.test(next);
      const isTimecode = /-->/.test(line);
      const isNumber = /^\d+$/.test(line);
      const isBlank = line.trim() === '';

      if (isTimecodeNext && !isTimecode && !isNumber && !isBlank) {
        return false; // drop the cue identifier
      }
      return true;
    }).join('\n');

    // --- Strip VTT cue timestamps inside text ---
    // <00:00:01.234> text →  text
    out = out.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '');

    // --- Strip VTT voice tags <v Speaker>Text ---
    // <v John>Hi!     → Hi!
    // <v Mary> Hello  →  Hello
    out = out.replace(/<v\s+[^>]*>/gi, '');

    // --- Strip VTT language tags <lang xx> ---
    out = out.replace(/<lang\s+[^>]*>/gi, '');
    out = out.replace(/<\/lang>/gi, '');

    // --- Strip VTT class tags <c.xxx> ---
    out = out.replace(/<c[^>]*>/gi, '');
    out = out.replace(/<\/c>/gi, '');

    // --- Strip all other HTML tags ---
    // <i>, </i>, <b>, </b>, <u>, </u>, <s>, </s>, <font ...>, </font>, <ruby>, <rt>
    out = out.replace(/<\/?[a-zA-Z][^>]*>/g, '');

    // --- Strip RT/LTR marks and zero-width chars ---
    out = out.replace(/[\u200B\u200E\u200F\u202A-\u202E\uFEFF]/g, '');

    // --- Convert timestamps: . → , ---
    // 00:00:01.000 --> 00:00:03.000
    // →
    // 00:00:01,000 --> 00:00:03,000
    out = out.replace(
      /(\d{2}:\d{2}:\d{2})\.(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2})\.(\d{3})/g,
      '$1,$2 --> $3,$4'
    );
    // Also handle missing-hours timestamps: 00:01.000 --> 00:03.000
    out = out.replace(
      /(\d{2}:\d{2})\.(\d{3})\s*-->\s*(\d{2}:\d{2})\.(\d{3})/g,
      '00:$1,$2 --> 00:$3,$4'
    );

    // --- Clean up: collapse multiple blank lines, trim each line ---
    out = out.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.trim() + '\n';

    return out;
  } catch (e) {
    console.error('[vttToSrt] Conversion failed:', e.message);
    return null;
  }
}

module.exports = { convertVttToSrt };
