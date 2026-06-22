const axios = require('axios');
const { bufferToUtf8 } = require('./encoding');
const { convertVttToSrt } = require('./vttToSrt');
const { convertAssToSrt } = require('./assToSrt');
const { extractSrtFromZip } = require('./zipExtract');
const { removeAds } = require('./removeAds');
const { log } = require('../logger');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { OS_DIRECT_URL_RE, OS_UA } = require('../constants');

const warpAgent = new SocksProxyAgent('socks5://127.0.0.1:40000');
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

// lzma-native is a native addon — load lazily so the converter still works
// (with reduced functionality) if it fails to load on some platform.
let lzmaDecompress = null;
try {
  const lzma = require('lzma-native');
  lzmaDecompress = lzma.decompress;
} catch (e) {
  log('warn', `[Converters] lzma-native not available — .xz decompression will fail. Error: ${e.message}`);
}

/**
 * Detect the compression / container format of a raw subtitle buffer by
 * inspecting magic bytes. Used when the URL has no useful extension
 * (AnimeTosho download URLs end in a numeric file id, not an extension).
 *
 * @param {Buffer} buf
 * @returns {{type: string, ext: string}}
 *   type: 'xz' | 'gz' | 'zip' | 'ass' | 'vtt' | 'srt' | 'unknown'
 */
function detectFormat(buf) {
  if (!buf || buf.length < 4) return { type: 'unknown', ext: '' };

  // Magic-byte sniffing
  if (buf[0] === 0xfd && buf[1] === 0x37 && buf[2] === 0x7a && buf[3] === 0x58) {
    return { type: 'xz', ext: 'xz' };
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return { type: 'gz', ext: 'gz' };
  }
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    return { type: 'zip', ext: 'zip' };
  }

  // Plain-text formats — check the first 256 bytes for signature markers.
  const head = buf.slice(0, 256).toString('latin1');
  if (head.includes('[Script Info]') || head.includes('[V4+ Styles]') || head.includes('[Events]')) {
    return { type: 'ass', ext: 'ass' };
  }
  if (head.startsWith('WEBVTT')) {
    return { type: 'vtt', ext: 'vtt' };
  }
  // SRT signature: a number on the first line, then a HH:MM:SS,mmm --> ... line
  if (/^\s*\d+\s*\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(head)) {
    return { type: 'srt', ext: 'srt' };
  }
  return { type: 'unknown', ext: '' };
}

/**
 * Decompress an .xz buffer to a raw UTF-8 string buffer.
 * Uses lzma-native, which returns a Promise when called without a callback.
 * Throws if lzma-native is not installed.
 * @param {Buffer} xzBuf
 * @returns {Promise<Buffer>}
 */
async function decompressXz(xzBuf) {
  if (!lzmaDecompress) {
    throw new Error('lzma-native not available — cannot decompress .xz');
  }
  // lzma-native v8 returns a Promise when no callback is passed.
  return lzmaDecompress(xzBuf);
}

/**
 * Download a subtitle and convert it to clean SRT.
 *
 * Handles all the format quirks we've encountered in production:
 *
 *   - AnimeTosho: serves ASS compressed as .xz (magic bytes fd 37 7a 58).
 *     The .xz must be decompressed with lzma-native before the ASS content
 *     can be parsed. The download URL has no extension (it's a numeric
 *     file id like /download/616712/subs/file/61737), so we detect the
 *     format from magic bytes.
 *   - OpenSubtitles: serves SRT compressed as .gz (magic bytes 1f 8b).
 *     Routes via WARP SOCKS5 proxy AND sends the legacy X-User-Agent:
 *     VLSub 0.10.3 header. Without that header the download endpoint
 *     returns 401 even through WARP.
 *   - SubSource: download endpoint returns a ZIP (api_key as query param).
 *     The ZIP may contain .srt, .ass, .ssa, or .vtt — extractSrtFromZip
 *     handles all four with on-the-fly ASS→SRT conversion.
 *   - SubDL: normalises dl.subdl.com URLs and strips api_key from query.
 *   - Wyzie: returns direct VTT/ASS URLs (no compression).
 *
 * Encoding: chardet + iconv-lite normalises Shift-JIS / Big5 / GBK / etc.
 *
 * @param {SubtitleResult} sub
 * @returns {Promise<string|null>} Clean SRT content, or null on failure.
 */
async function convertToSrt(sub) {
  try {
    let downloadUrl = sub.url;

    // SubDL relative-path normalisation
    if (downloadUrl.includes('subdl.com') && !downloadUrl.startsWith('http')) {
      try {
        const u = new URL('https://example.com' + downloadUrl);
        downloadUrl = 'https://dl.subdl.com' + u.pathname + (u.search || '');
      } catch (_) { /* fall through, use original URL */ }
    }

    const urlObj = new URL(downloadUrl);
    const referer = urlObj.origin + '/';

    // OpenSubtitles: route via WARP AND send legacy X-User-Agent header.
    const isOpenSubtitles = OS_DIRECT_URL_RE.test(downloadUrl);
    const agent = isOpenSubtitles ? warpAgent : null;

    const headers = {
      'User-Agent': BROWSER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': referer,
    };
    if (isOpenSubtitles) {
      headers['X-User-Agent'] = OS_UA;
    }

    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
      httpAgent: agent,
      httpsAgent: agent,
      headers,
      // Don't let axios auto-decompress — we want the raw bytes for
      // magic-byte sniffing (AnimeTosho .xz, OpenSubtitles .gz).
      decompress: false,
      maxRedirects: 5,
    });

    let buffer = Buffer.from(response.data);
    log('debug', `[Converters] Downloaded ${downloadUrl.substring(0, 80)} — ${buffer.length} bytes, first 4: ${buffer.slice(0, 4).toString('hex')}`);

    // --- Decompress if needed (by magic bytes, not URL extension) ---------
    // AnimeTosho URLs end in a numeric file id, so we can't rely on .xz in
    // the URL. We must sniff the buffer.
    const detected = detectFormat(buffer);
    if (detected.type === 'xz') {
      log('debug', `[Converters] Detected .xz compression — decompressing with lzma-native.`);
      try {
        buffer = await decompressXz(buffer);
      } catch (e) {
        log('warn', `[Converters] .xz decompression failed for ${downloadUrl}: ${e.message}`);
        return null;
      }
    } else if (detected.type === 'gz') {
      log('debug', `[Converters] Detected .gz compression — decompressing with zlib.`);
      const zlib = require('zlib');
      try {
        buffer = zlib.gunzipSync(buffer);
      } catch (e) {
        log('warn', `[Converters] gzip decompression failed for ${downloadUrl}: ${e.message}`);
        return null;
      }
    }

    // --- Convert to SRT based on actual content (re-detect after decompression)
    let srtContent = null;
    const postFormat = detectFormat(buffer);

    if (postFormat.type === 'zip' || sub.format === 'zip') {
      srtContent = extractSrtFromZip(buffer);
    } else if (postFormat.type === 'ass' || sub.format === 'ass' || sub.format === 'ssa' ||
               (sub.fileName && (sub.fileName.toLowerCase().endsWith('.ass') || sub.fileName.toLowerCase().endsWith('.ssa')))) {
      srtContent = convertAssToSrt(bufferToUtf8(buffer));
    } else if (postFormat.type === 'vtt' || sub.format === 'vtt' ||
               (sub.fileName && sub.fileName.toLowerCase().endsWith('.vtt'))) {
      srtContent = convertVttToSrt(bufferToUtf8(buffer));
    } else {
      // Plain SRT or unknown — pass through UTF-8 normalisation.
      srtContent = bufferToUtf8(buffer);
    }

    if (!srtContent) {
      log('warn', `[Converters] Conversion produced empty content for ${downloadUrl} (detected: ${postFormat.type}).`);
      return null;
    }
    return removeAds(srtContent);
  } catch (e) {
    const statusCode = e.response?.status || 'Unknown';
    log('warn', `[Converters] Skipping ${sub.url}: Failed with status ${statusCode} — ${e.message}`);
    return null;
  }
}

module.exports = { convertToSrt, detectFormat };