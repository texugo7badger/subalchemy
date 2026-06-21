const chardet = require('chardet');
const iconv = require('iconv-lite');

function bufferToUtf8(buffer) {
  if (!buffer || buffer.length === 0) return '';
  
  // Check BOMs
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.toString('utf-8').slice(1);
  }
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return iconv.decode(buffer, 'utf-16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return iconv.decode(buffer, 'utf-16be');
  }

  const detected = chardet.detect(buffer);
  if (!detected) {
    try {
      const utf8 = buffer.toString('utf-8');
      if (!utf8.includes('\uFFFD')) return utf8;
    } catch (e) {}
    return iconv.decode(buffer, 'iso-8859-1');
  }

  const encodingMap = {
    'ISO-8859-1': 'iso-8859-1', 'windows-1252': 'windows-1252', 'windows-1250': 'windows-1250',
    'UTF-8': 'utf-8', 'ascii': 'utf-8', 'Big5': 'big5', 'GB2312': 'gb2312', 'GBK': 'gbk',
    'EUC-KR': 'euc-kr', 'Shift_JIS': 'shift-jis', 'EUC-JP': 'euc-jp', 'KOI8-R': 'koi8-r'
  };
  
  const normalized = encodingMap[detected] || detected.toLowerCase();
  if (!iconv.encodingExists(normalized)) {
    return iconv.decode(buffer, 'iso-8859-1');
  }
  
  return iconv.decode(buffer, normalized);
}

module.exports = { bufferToUtf8 };