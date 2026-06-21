const axios = require('axios');
const { bufferToUtf8 } = require('./encoding');
const { convertVttToSrt } = require('./vttToSrt');
const { convertAssToSrt } = require('./assToSrt');
const { extractSrtFromZip } = require('./zipExtract');
const { removeAds } = require('./removeAds');
const { log } = require('../logger');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { OS_DIRECT_URL_RE } = require('../constants');

const warpAgent = new SocksProxyAgent('socks5://127.0.0.1:40000');

async function convertToSrt(sub) {
  try {
    let downloadUrl = sub.url;
    
    // Garante URL absoluta para SubDL
    if (downloadUrl.includes('subdl.com') && !downloadUrl.startsWith('https://subdl.com')) {
       downloadUrl = 'https://subdl.com' + new URL(downloadUrl).pathname + new URL(downloadUrl).search;
    }

    const urlObj = new URL(downloadUrl);
    const referer = urlObj.origin + '/';
    
    // Usa o proxy WARP se for URL do OpenSubtitles para evitar 403 no download
    const agent = OS_DIRECT_URL_RE.test(downloadUrl) ? warpAgent : null;

    const response = await axios.get(downloadUrl, { 
      responseType: 'arraybuffer',
      timeout: 10000,
      httpAgent: agent,
      httpsAgent: agent,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': referer
      }
    });
    
    let srtContent = null;
    const buffer = Buffer.from(response.data);

    if (sub.format === 'zip' || sub.url.toLowerCase().includes('.zip')) {
      srtContent = extractSrtFromZip(buffer);
    } else if (sub.format === 'ass' || sub.fileName.toLowerCase().endsWith('.ass')) {
      srtContent = convertAssToSrt(bufferToUtf8(buffer));
    } else if (sub.format === 'vtt' || sub.fileName.toLowerCase().endsWith('.vtt')) {
      srtContent = convertVttToSrt(bufferToUtf8(buffer));
    } else {
      srtContent = bufferToUtf8(buffer);
    }

    if (!srtContent) return null;
    return removeAds(srtContent);
  } catch (e) {
    log('error', `[Converters] Failed to process ${sub.url}: ${e.message}`);
    return null;
  }
}
module.exports = { convertToSrt };