const AdmZip = require('adm-zip');
const { bufferToUtf8 } = require('./encoding');
const { convertAssToSrt } = require('./assToSrt');
const { log } = require('../logger');

/**
 * Extract an SRT subtitle from a ZIP buffer.
 *
 * Subtitle ZIPs (from SubSource, SubDL, OpenSubtitles, etc.) usually contain
 * a single .srt file. Some fan-sub packs contain .ass or .ssa instead — for
 * those, we extract the ASS content and convert it to SRT on the fly using
 * the same ass-compiler pipeline used for non-zipped ASS files.
 *
 * Priority order when scanning ZIP entries:
 *   1. First .srt file found
 *   2. First .ass / .ssa file (converted to SRT)
 *   3. First .vtt file (returned as-is; the caller's convertToSrt will
 *      route .vtt through convertVttToSrt when needed — but here we just
 *      return the UTF-8 text and let the caller decide)
 *
 * @param {Buffer} buffer - ZIP file as a Node Buffer
 * @returns {string|null} Subtitle text (SRT or ASS-to-SRT), or null on failure
 */
function extractSrtFromZip(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // Pass 1: prefer .srt
    for (const entry of entries) {
      if (entry.entryName.toLowerCase().endsWith('.srt')) {
        return bufferToUtf8(entry.getData());
      }
    }

    // Pass 2: convert .ass/.ssa to SRT
    for (const entry of entries) {
      const name = entry.entryName.toLowerCase();
      if (name.endsWith('.ass') || name.endsWith('.ssa')) {
        const assContent = bufferToUtf8(entry.getData());
        const srt = convertAssToSrt(assContent);
        if (srt) {
          log('debug', `[zipExtract] Converted ${entry.entryName} (ASS) to SRT inside ZIP.`);
          return srt;
        }
      }
    }

    // Pass 3: return .vtt as raw text (caller's convertToSrt will route)
    for (const entry of entries) {
      if (entry.entryName.toLowerCase().endsWith('.vtt')) {
        log('debug', `[zipExtract] Extracted ${entry.entryName} (VTT) from ZIP.`);
        return bufferToUtf8(entry.getData());
      }
    }

    log('warn', '[zipExtract] No .srt/.ass/.ssa/.vtt file found inside ZIP.');
    return null;
  } catch (e) {
    log('error', `[zipExtract] Failed: ${e.message}`);
    return null;
  }
}

module.exports = { extractSrtFromZip };