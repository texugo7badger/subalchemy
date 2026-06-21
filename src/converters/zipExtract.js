const AdmZip = require('adm-zip');
const { bufferToUtf8 } = require('./encoding');

function extractSrtFromZip(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    for (const entry of entries) {
      if (entry.entryName.toLowerCase().endsWith('.srt')) {
        const srtBuffer = entry.getData();
        return bufferToUtf8(srtBuffer);
      }
    }
    return null;
  } catch (e) {
    console.error('[zipExtract] Failed:', e.message);
    return null;
  }
}

module.exports = { extractSrtFromZip };