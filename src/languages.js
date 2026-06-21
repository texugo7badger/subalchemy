const LANG_MAP = {
  'pt-br': 'pob', 'ptbr': 'pob', 'portuguese-brazil': 'pob', 'pb': 'pob',
  'pt': 'por', 'portuguese': 'por',
  'en': 'eng', 'english': 'eng',
  'es': 'spa', 'spanish': 'spa',
  'fr': 'fra', 'french': 'fra',
  'de': 'deu', 'german': 'deu',
  'it': 'ita', 'italian': 'ita',
  'ja': 'jpn', 'japanese': 'jpn',
  'zh': 'zho', 'chinese': 'zho', 'zh-cn': 'zho', 'zh-tw': 'zht',
  'ru': 'rus', 'russian': 'rus',
  'ar': 'ara', 'arabic': 'ara',
  'hi': 'hin', 'hindi': 'hin',
  'ko': 'kor', 'korean': 'kor'
};

const LANG_NAMES = {
  'pob': 'Portuguese (Brazil)',
  'por': 'Portuguese',
  'eng': 'English',
  'spa': 'Spanish',
  'fra': 'French',
  'deu': 'German',
  'ita': 'Italian',
  'jpn': 'Japanese',
  'zho': 'Chinese',
  'zht': 'Chinese (Traditional)',
  'rus': 'Russian',
  'ara': 'Arabic',
  'hin': 'Hindi',
  'kor': 'Korean'
};

function normalizeLang(lang) {
  if (!lang) return null;
  return LANG_MAP[lang.toLowerCase()] || lang.toLowerCase();
}

function getLanguageName(code) {
  return LANG_NAMES[code] || code.toUpperCase();
}

function isPortuguese(langCode) {
    const normalized = normalizeLang(langCode);
    return ['pob', 'por', 'pb', 'pt'].includes(normalized);
}

module.exports = { normalizeLang, getLanguageName, isPortuguese };