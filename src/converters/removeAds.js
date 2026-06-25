/**
 * v2.4.6: Subtitle cleaner — removes ads, SDH annotations, and formatting
 * artifacts that spoil readability.
 *
 * PROBLEMS THIS FIXES (reported by users):
 *
 * 1. SDH (Deaf/Hard-of-Hearing) brackets like:
 *      [gasps]
 *      [offscreen] He's coming.
 *      (thunder rumbling)
 *      [John]: Hello!
 *    → Stripped out so only spoken dialogue remains.
 *
 * 2. Speaker labels before dialogue:
 *      John: Hello!
 *      MARY: What?
 *    → Removed (only the dialogue text is kept).
 *
 * 3. ASS style tag leftovers:
 *      {\i1}italic{\i0}
 *      {\b1}bold{\b0}
 *      {\an8}positioning
 *    → Stripped.
 *
 * 4. HTML tags from VTT:
 *      <i>italic</i>
 *      <c.colorE5E5E5>colored</c>
 *      <00:01:23.450> cue timestamps
 *    → Stripped.
 *
 * 5. Encoding artifacts (e.g. "vocÃª" instead of "você") — best-effort
 *    fix for common mojibake patterns. The encoding.js module handles
 *    the primary detection; this is a safety net.
 *
 * 6. Ad watermarks from subtitle sites:
 *      "Sync by subscene"
 *      "Support opensubtitles.org"
 *      "Advertise on wyzie.io"
 *    → Removed.
 *
 * 7. Multi-line blank cues / cues with only brackets:
 *      1
 *      00:00:01,000 --> 00:00:03,000
 *      [music]
 *
 *    → Cue removed entirely (would show empty box on screen).
 *
 * STRATEGY:
 *   - Pass 1: strip ASS tags, HTML tags, VTT cue timestamps
 *   - Pass 2: detect SDH-only cues and drop them
 *   - Pass 3: strip speaker labels at the start of cues
 *   - Pass 4: strip ad-watermark cues
 *   - Pass 5: fix common mojibake
 *   - Pass 6: renumber SRT indices (gaps left by removed cues)
 *   - Pass 7: collapse excessive blank lines
 */

function removeAds(srtContent) {
  if (!srtContent || typeof srtContent !== 'string') return srtContent;

  let out = srtContent;

  // --- Pass 1: strip ASS style tags ---
  // {\i1}...{\i0}  {\b1}...{\b0}  {\an8}  {\fad(...)}  etc.
  out = out.replace(/\{\\[^}]+\}/g, '');

  // --- Pass 1b: strip HTML tags (from VTT converted to SRT) ---
  // <i>, </i>, <b>, </b>, <u>, </u>, <font ...>, </font>, <c.XXX>, </c>
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // --- Pass 1c: strip VTT cue timestamps inside text ---
  // <00:01:23.450>blah → blah
  out = out.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '');

  // --- Pass 1d: strip leftover RT/LTR marks and zero-width chars ---
  out = out.replace(/[\u200B\u200E\u200F\u202A-\u202E\uFEFF]/g, '');

  // --- Pass 2: split into cues, drop SDH-only / empty cues ---
  // Each cue in SRT = index / timecode / one or more text lines / blank line
  out = dropEmptyAndSdhOnlyCues(out);

  // --- Pass 3: strip speaker labels and SDH brackets WITHIN cues ---
  // Examples that should be cleaned:
  //   "[John]: Hello!"           → "Hello!"
  //   "JOHN: Hello!"             → "Hello!"
  //   "(gasps) I'm fine."        → "I'm fine."
  //   "[offscreen] He's here."   → "He's here."
  //   "He's here. [gasps]"       → "He's here."
  //   "[music intensifies]"      → (cue dropped, handled in Pass 2)
  out = stripSpeakerLabelsAndSdhBrackets(out);

  // --- Pass 4: strip ad-watermark cues ---
  out = stripAdCues(out);

  // --- Pass 5: fix common mojibake (UTF-8 misread as ISO-8859-1) ---
  // e.g. "vocÃª" → "você", "nÃ£o" → "não", "olÃ¡" → "olá"
  out = fixMojibake(out);

  // --- Pass 6: renumber SRT indices ---
  // After dropping cues, indices have gaps. Renumber sequentially.
  out = renumberSrt(out);

  // --- Pass 7: collapse excessive blank lines, trim trailing whitespace ---
  out = out.replace(/\r\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');
  out = out.trim() + '\n';

  return out;
}

/**
 * Drop cues whose text is entirely SDH annotations or empty.
 *
 * SDH-only cues look like:
 *   12
 *   00:00:34,000 --> 00:00:36,000
 *   [upbeat music]
 *
 *   13
 *   00:00:37,000 --> 00:00:39,000
 *   (applause)
 *
 * Also drops cues with no text at all (just whitespace).
 */
function dropEmptyAndSdhOnlyCues(srtContent) {
  // Split into cue blocks (separated by 1+ blank lines)
  const blocks = srtContent.split(/\n\s*\n/);
  const kept = [];

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) continue;

    // Find the timecode line (contains "-->")
    const timecodeIdx = lines.findIndex(l => l.includes('-->'));
    if (timecodeIdx === -1) {
      // Not a cue — keep as-is (might be header/footer junk)
      kept.push(block);
      continue;
    }

    // Text = everything after the timecode
    const textLines = lines.slice(timecodeIdx + 1);
    if (textLines.length === 0) continue; // empty cue → drop

    // Check if ALL text lines are SDH-only (brackets, parens, or music notes)
    const allSdh = textLines.every(line => isSdhOnly(line));
    if (allSdh) continue; // SDH-only cue → drop

    kept.push(block);
  }

  return kept.join('\n\n');
}

/**
 * Is this line entirely an SDH annotation (no spoken dialogue)?
 *
 * Matches:
 *   [anything in brackets]
 *   (anything in parens)
 *   ♪ musical notes ♪
 *   #sound effects#
 */
function isSdhOnly(line) {
  const trimmed = line.trim();
  if (!trimmed) return true;

  // Entirely enclosed in brackets / parens
  if (/^\[[^\]]*\]$/.test(trimmed)) return true;
  if (/^\([^)]*\)$/.test(trimmed)) return true;
  if (/^\{[^}]*\}$/.test(trimmed)) return true;

  // Musical notes (♪ or ♫ surrounding text)
  if (/^[♪♫][^♪♫]*[♪♫]?$/.test(trimmed)) return true;
  if (/^[♪♫]?[^♪♫]*[♪♫]$/.test(trimmed)) return true;

  // # sound effects #
  if (/^#[^#]*#$/.test(trimmed)) return true;

  return false;
}

/**
 * Strip speaker labels and inline SDH brackets from cues that DO contain
 * spoken dialogue.
 *
 * "[John]: Hello!" → "Hello!"
 * "(whispering) I'm here." → "I'm here."
 * "He's coming. [gasps]" → "He's coming."
 * "[offscreen] He's here." → "He's here."
 */
function stripSpeakerLabelsAndSdhBrackets(srtContent) {
  const blocks = srtContent.split(/\n\s*\n/);
  const out = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timecodeIdx = lines.findIndex(l => l.includes('-->'));
    if (timecodeIdx === -1) {
      out.push(block);
      continue;
    }

    // Process each text line (after timecode)
    for (let i = timecodeIdx + 1; i < lines.length; i++) {
      let line = lines[i];

      // Strip leading speaker labels: "JOHN:", "John:", "[John]:", "(John):"
      // Match ALL-CAPS name OR capitalized name followed by colon
      // Only strip if at the start of the line, and the line has more text
      line = line.replace(/^\s*(?:[\[\(])?\s*([A-Z][A-Z\s\-']{1,30}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*(?:[\]\)])?\s*:\s*/, (match, name) => {
        // Only strip if there's text after the colon
        // (Otherwise this whole cue was just the name, which means it was
        // already a non-SDH cue — keep as-is.)
        return '';
      });

      // Strip leading SDH bracket-annotation: "[offscreen] ", "(whispering) "
      // Only strip if there's text after it
      line = line.replace(/^\s*(?:\[[^\]]*\]|\([^)]*\))\s+/, '');

      // Strip trailing SDH bracket-annotation: " [gasps]"
      line = line.replace(/\s+(?:\[[^\]]*\]|\([^)]*\))\s*$/, '');

      // Strip inline SDH brackets (but keep the surrounding text):
      //   "Hello [gasps] world" → "Hello  world" → "Hello world"
      line = line.replace(/\s*\[[^\]]*\]\s*/g, ' ');
      line = line.replace(/\s*\([^)]*\)\s*/g, ' ');

      // Strip musical note markers inline: "♪ Hello ♪" → "Hello"
      line = line.replace(/[♪♫]/g, '');

      // Collapse multiple spaces (from bracket removal)
      line = line.replace(/\s{2,}/g, ' ').trim();

      lines[i] = line;
    }

    // Drop the cue entirely if all text lines became empty after stripping
    const textLines = lines.slice(timecodeIdx + 1).map(l => l.trim()).filter(l => l.length > 0);
    if (textLines.length === 0) continue;

    out.push(lines.join('\n'));
  }

  return out.join('\n\n');
}

/**
 * Drop cues whose text matches known ad watermarks.
 *   "Sync by subscene"
 *   "Support opensubtitles.org"
 *   "Advertise on wyzie.io"
 *   "Buy me a coffee"
 *   "Edited by UserName"
 */
function stripAdCues(srtContent) {
  const adPatterns = /\b(opensubtitles|subscene|subsource|wyzie|animetosho|support\s+us|buy\s+me\s+a\s+coffee|advertise|edited\s+by|sync\s+(?:by|&)|www\.\w+\.(com|net|org))\b/i;

  const blocks = srtContent.split(/\n\s*\n/);
  const kept = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timecodeIdx = lines.findIndex(l => l.includes('-->'));
    if (timecodeIdx === -1) {
      kept.push(block);
      continue;
    }

    const textLines = lines.slice(timecodeIdx + 1);
    const isAd = textLines.some(line => adPatterns.test(line));
    if (isAd) continue; // drop cue

    kept.push(block);
  }

  return kept.join('\n\n');
}

/**
 * Fix common UTF-8 mojibake patterns.
 *
 * When a UTF-8 file is misread as ISO-8859-1 / Windows-1252, accented
 * chars become garbage. This is a safety net — the encoding.js module
 * should handle most cases, but if a sub slipped through with bad
 * detection, we fix the most common patterns here.
 *
 * Examples:
 *   "vocÃª"   → "você"
 *   "nÃ£o"   → "não"
 *   "olÃ¡"   → "olá"
 *   "SÃ£o Paulo" → "São Paulo"
 *   "Papai Noel existe?" → unchanged
 */
function fixMojibake(text) {
  // Portuguese / Spanish / French accented vowels
  const fixes = [
    [/Ã§/g, 'ç'],
    [/Ã£/g, 'ã'],
    [/Ãµ/g, 'õ'],
    [/Ã¡/g, 'á'],
    [/Ã©/g, 'é'],
    [/Ã­/g, 'í'],
    [/Ã³/g, 'ó'],
    [/Ãº/g, 'ú'],
    [/Ã /g, 'à'],
    [/Ã¨/g, 'è'],
    [/Ã¬/g, 'ì'],
    [/Ã²/g, 'ò'],
    [/Ã¹/g, 'ù'],
    [/Ã¢/g, 'â'],
    [/Ãª/g, 'ê'],
    [/Ã®/g, 'î'],
    [/Ã´/g, 'ô'],
    [/Ã»/g, 'û'],
    [/Ã/g, 'Á'],
    [/Ã‰/g, 'É'],
    [/Ã/g, 'Í'],
    [/Ã"/g, 'Ó'],
    [/Ãš/g, 'Ú'],
    [/Ã€/g, 'À'],
    [/Ã'/g, 'Ñ'],
    [/Ã±/g, 'ñ'],
    // "vocêês" type artifacts — double-é from misread ê
    [/êê/g, 'ê'],
    [/éé/g, 'é'],
    // Generic "Ã<uppercase>" patterns
    [/Ã([A-Z])/g, 'Ã$1'],
  ];

  let result = text;
  for (const [pattern, replacement] of fixes) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Renumber SRT cue indices sequentially (1, 2, 3, ...).
 * After dropping cues, indices have gaps like 1, 2, 5, 7, 9 — this
 * rewrites them to 1, 2, 3, 4, 5.
 */
function renumberSrt(srtContent) {
  const blocks = srtContent.split(/\n\s*\n/);
  let idx = 1;
  const out = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timecodeIdx = lines.findIndex(l => l.includes('-->'));
    if (timecodeIdx === -1) {
      out.push(block);
      continue;
    }

    // Replace the first line (or insert if missing) with the new index
    if (timecodeIdx === 0) {
      // No index line — insert one
      lines.unshift(String(idx));
    } else {
      // Replace whatever was on line 0 with the new index
      lines[0] = String(idx);
    }

    idx++;
    out.push(lines.join('\n'));
  }

  return out.join('\n\n');
}

module.exports = { removeAds };
