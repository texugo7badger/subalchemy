const axios = require('axios');
const { bufferToUtf8 } = require('./encoding');
const { convertVttToSrt } = require('./vttToSrt');
const { convertAssToSrt } = require('./assToSrt');
const { extractSrtFromZip } = require('./zipExtract');
const { removeAds } = require('./removeAds');
const { log } = require('../logger');

async function convertToSrt(sub) {
  try {
    const response = await axios.get(sub.url, { 
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
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
      // Assume SRT
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