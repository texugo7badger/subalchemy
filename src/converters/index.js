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

/**
 * Download a subtitle and convert it to clean SRT.
 *
 * Handles:
 *   - OpenSubtitles: routes via WARP SOCKS5 proxy AND sends the legacy
 *     `X-User-Agent: VLSub 0.10.3` header. Without that header the
 *     download endpoint returns 401 — even through WARP.
 *   - SubDL: normalises dl.subdl.com URLs.
 *   - SubSource: download endpoint accepts api_key as query param.
 *   - AnimeTosho: server auto-decompresses .xz, returns raw ASS.
 *   - Encoding: chardet + iconv-lite for Shift-JIS / Big5 / etc.
 *   - Format: ZIP (with inner .srt/.ass/.ssa/.vtt), ASS/SSA, VTT, SRT.
 *
 * @param {SubtitleResult} sub
 * @returns {Promise<string|null>} Clean SRT content, or null on failure.
 */
async function convertToSrt(sub) {
  try {
    let downloadUrl = sub.url;

    // SubDL relative-path normalisation
    if (downloadUrl.includes('subdl.com') && !downloadUrl.startsWith('http')) {
      downloadUrl = 'https://dl.subdl.com' + new URL('https://example.com' + downloadUrl).pathname + (downloadUrl.includes('?') ? '?' + downloadUrl.split('?')[1] : '');
    }

    const urlObj = new URL(downloadUrl);
    const referer = urlObj.origin + '/';

    // OpenSubtitles: route via WARP AND send legacy X-User-Agent header.
    // The header is what the legacy REST API uses for auth on the
    // download endpoint — without it, even a valid .gz URL returns 401.
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
    });

    let srtContent = null;
    const buffer = Buffer.from(response.data);

    if (sub.format === 'zip' || downloadUrl.toLowerCase().includes('.zip')) {
      srtContent = extractSrtFromZip(buffer);
    } else if (sub.format === 'ass' || sub.format === 'ssa' ||
               sub.fileName.toLowerCase().endsWith('.ass') ||
               sub.fileName.toLowerCase().endsWith('.ssa')) {
      srtContent = convertAssToSrt(bufferToUtf8(buffer));
    } else if (sub.format === 'vtt' || sub.fileName.toLowerCase().endsWith('.vtt')) {
      srtContent = convertVttToSrt(bufferToUtf8(buffer));
    } else if (downloadUrl.toLowerCase().endsWith('.gz')) {
      // OpenSubtitles .gz files are gzip-compressed SRT. axios arraybuffer
      // gives us the raw gzip bytes — decompress before parsing.
      const zlib = require('zlib');
      try {
        const decompressed = zlib.gunzipSync(buffer);
        srtContent = bufferToUtf8(decompressed);
      } catch (e) {
        log('warn', `[Converters] gzip decompression failed for ${downloadUrl}: ${e.message}`);
        srtContent = bufferToUtf8(buffer); // try raw fallback
      }
    } else {
      srtContent = bufferToUtf8(buffer);
    }

    if (!srtContent) return null;
    return removeAds(srtContent);
  } catch (e) {
    const statusCode = e.response?.status || 'Unknown';
    log('warn', `[Converters] Skipping ${sub.url}: Failed with status ${statusCode}`);
    return null;
  }
}

module.exports = { convertToSrt };