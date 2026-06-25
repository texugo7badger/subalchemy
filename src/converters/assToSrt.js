const { compile } = require('ass-compiler');
const subsrt = require('subsrt-ts');

/**
 * v2.4.6: Convert ASS/SSA to SRT with proper cleanup of ASS artifacts.
 *
 * PROBLEMS THIS FIXES (reported by users):
 *
 * 1. ASS style tags leaking into the SRT text:
 *      "{\i1}Hello!{\i0}" → "Hello!" (italic stripped, text kept)
 *      "{\an8}Top text"   → "Top text"
 *      "{\fad(200,200)}"  → "" (fade removed entirely)
 *
 * 2. ASS drawing commands leaking:
 *      "{\p1}m 0 0 l 100 0 100 100 0 100{" → "" (drawing stripped)
 *
 * 3. Line break codes:
 *      "Line 1\NLine 2" → "Line 1\nLine 2"
 *      "Line 1\nLine 2" → "Line 1\nLine 2"  (lowercase \n too)
 *
 * 4. Inline formatting that affects readability:
 *      "{\b1}Bold{\b0}" → "Bold"
 *      "{\i1}Italic{\i0}" → "Italic"
 *      "{\u1}Underline{\u0}" → "Underline"
 *      "{\s1}Strike{\s0}" → "Strike"
 *
 * STRATEGY:
 *   - ass-compiler parses the ASS into structured dialogues
 *   - We extract text from each fragment, stripping all style tags
 *   - We convert \N and \n to actual newlines
 *   - subsrt-ts builds the final SRT
 *   - The removeAds pass (called after this in convertToSrt) handles
 *     any remaining SDH brackets / speaker labels
 */
function convertAssToSrt(assContent) {
  try {
    const compiled = compile(assContent);
    const captions = compiled.dialogues.map((dialog, index) => {
      let text = '';

      if (dialog.slices) {
        for (const slice of dialog.slices) {
          if (!slice.fragments) continue;
          for (const fragment of slice.fragments) {
            // fragment.text may contain ASS inline tags like {\i1}
            let fragmentText = fragment.text || '';

            // v2.5.0: strip ASS inline style tags from fragment text
            // (ass-compiler sometimes leaves them in the text)
            fragmentText = fragmentText.replace(/\{\\[^}]*\}/g, '');

            // Skip pure-drawing fragments: {\p1}m 0 0 l 100 0...{\p0}
            // These don't contain dialogue, just vector commands
            if (/^\s*m\s+\d+\s+\d+\s+/.test(fragmentText)) continue;

            text += fragmentText;
          }
        }
      }

      // Convert ASS line breaks to actual newlines
      // \N = hard line break (forced)
      // \n = soft line break (only in wrapped styles)
      text = text.replace(/\\N/g, '\n').replace(/\\n/g, '\n');

      // Strip any leftover ASS override blocks that survived
      text = text.replace(/\{[^}]*\}/g, '');

      // Trim each line individually (ASS can have leading/trailing spaces
      // that mess with SRT display)
      text = text.split('\n').map(l => l.trim()).filter(l => l.length > 0).join('\n');

      // Final trim
      text = text.trim();

      return {
        index: index + 1,
        start: Math.round(dialog.start * 1000),
        end: Math.round(dialog.end * 1000),
        text: text,
      };
    }).filter(cap => cap.text.length > 0);

    if (captions.length === 0) {
      console.error('[assToSrt] No captions after cleanup — ASS may have been drawing-only or empty.');
      return null;
    }

    return subsrt.build(captions, { format: 'srt' });
  } catch (e) {
    console.error('[assToSrt] Conversion failed:', e.message);
    return null;
  }
}

module.exports = { convertAssToSrt };
