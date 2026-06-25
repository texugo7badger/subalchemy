const chardet = require('chardet');
const iconv = require('iconv-lite');

/**
 * v2.4.6: Robust encoding detection with UTF-8 priority.
 *
 * PROBLEMS THIS FIXES (reported by users):
 *
 * 1. "vocêês" appearing in PT-BR subtitles instead of "você" / "vocês"
 *    This happens when a UTF-8 file is misdetected as ISO-8859-1.
 *    Solution: ALWAYS try UTF-8 first, and only fall back to other
 *    encodings if UTF-8 decoding produces replacement chars (\uFFFD).
 *
 * 2. CP1252 vs ISO-8859-1 ambiguity:
 *    CP1252 has extra chars in the 0x80-0x9F range (smart quotes, dashes)
 *    that ISO-8859-1 renders as control chars. Prefer CP1252 over
 *    ISO-8859-1 when the range is present.
 *
 * STRATEGY:
 *   1. Check BOMs (UTF-8, UTF-16LE, UTF-16BE)
 *   2. Try UTF-8 strict — if it decodes without \uFFFD, USE IT
 *   3. If UTF-8 fails, use chardet detection
 *   4. If still ambiguous, prefer CP1252 over ISO-8859-1
 *   5. Last resort: ISO-8859-1 (never fails, but may have wrong chars)
 */
function bufferToUtf8(buffer) {
  if (!buffer || buffer.length === 0) return '';

  // --- 1. BOM checks ---
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    // UTF-8 BOM — strip and decode
    return buffer.slice(3).toString('utf-8');
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return iconv.decode(buffer, 'utf-16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return iconv.decode(buffer, 'utf-16be');
  }

  // --- 2. Try UTF-8 FIRST (v2.5.0 critical fix) ---
  // Most modern subtitle uploads are UTF-8. chardet sometimes misdetects
  // UTF-8 with accented chars as ISO-8859-1, which causes "vocÃª" → "você"
  // to become "você" (broken — missing the proper "ê" rendering in some
  // players) or worse, "vocêês" when the encoding confusion compounds.
  //
  // We use Buffer.toString('utf-8') which is lenient by default — if it
  // produces NO replacement chars, the buffer is valid UTF-8.
  try {
    const utf8Attempt = buffer.toString('utf-8');
    if (!utf8Attempt.includes('\uFFFD')) {
      // No replacement chars = valid UTF-8 — use it.
      return utf8Attempt;
    }
  } catch (e) {
    // Fall through to chardet
  }

  // --- 3. chardet detection ---
  const detected = chardet.detect(buffer);

  // --- 4. Prefer CP1252 over ISO-8859-1 (v2.5.0) ---
  // chardet often returns 'ISO-8859-1' when the actual encoding is
  // Windows-1252 (CP1252). CP1252 is a superset of ISO-8859-1 with
  // smart quotes (0x91-0x94), em-dash (0x97), and other punctuation in
  // the 0x80-0x9F range that ISO-8859-1 renders as control chars.
  //
  // If the buffer uses ANY byte in 0x80-0x9F, prefer CP1252.
  let chosenEncoding = detected;
  if (detected === 'ISO-8859-1' || detected === 'windows-1252') {
    if (usesWindows1252Range(buffer)) {
      chosenEncoding = 'windows-1252';
    }
  }

  const encodingMap = {
    'ISO-8859-1': 'iso-8859-1',
    'ISO-8859-2': 'iso-8859-2',
    'ISO-8859-15': 'iso-8859-15',
    'windows-1250': 'windows-1250',
    'windows-1252': 'windows-1252',
    'UTF-8': 'utf-8',
    'ASCII': 'utf-8',
    'Big5': 'big5',
    'GB2312': 'gb2312',
    'GBK': 'gbk',
    'EUC-KR': 'euc-kr',
    'Shift_JIS': 'shift-jis',
    'EUC-JP': 'euc-jp',
    'KOI8-R': 'koi8-r',
  };

  const normalized = chosenEncoding ? (encodingMap[chosenEncoding] || chosenEncoding.toLowerCase()) : null;

  if (normalized && iconv.encodingExists(normalized)) {
    return iconv.decode(buffer, normalized);
  }

  // --- 5. Last resort: ISO-8859-1 (always succeeds) ---
  return iconv.decode(buffer, 'iso-8859-1');
}

/**
 * Check if the buffer uses bytes in the 0x80-0x9F range, which is the
 * Windows-1252-specific range (ISO-8859-1 reserves these as control chars).
 * If yes → prefer CP1252 over ISO-8859-1.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function usesWindows1252Range(buffer) {
  // Sample first 4KB to be fast (subtitles are typically <100KB)
  const sample = buffer.length > 4096 ? buffer.slice(0, 4096) : buffer;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] >= 0x80 && sample[i] <= 0x9F) {
      // Exclude common control chars that ARE valid in both encodings
      // 0x80-0x9F in ISO-8859-1 are C1 control chars (rarely used in subs)
      // 0x80-0x9F in CP1252 are: € ‚ ƒ „ … † ‡ ˆ ‰ Š ‹ Œ Ž ' ' " " " • – — ˜ ™ š › œ ž Ÿ
      // If we see these bytes at all, prefer CP1252 — it's the safer bet
      return true;
    }
  }
  return false;
}

module.exports = { bufferToUtf8 };
