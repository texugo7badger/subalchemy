const { generatePlaceholder: genPlaceholder } = require('./utils/subtitleUtils');

const LANG_MAP = {
  'pt-br': 'por', 'ptbr': 'por', 'portuguese-brazil': 'por', 'pb': 'por',
  'pt': 'por', 'portuguese': 'por', 'pob': 'por',
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

function normalizeLanguage(lang) {
  if (!lang) return null;
  const normalized = lang.toLowerCase().trim();
  return LANG_MAP[normalized] || normalized;
}

function normalizeLang(lang) {
  return normalizeLanguage(lang) || 'eng';
}

function getLanguageName(code) {
  const norm = normalizeLanguage(code);
  return LANG_NAMES[norm] || code.toUpperCase();
}

function isPortuguese(langCode) {
  return normalizeLanguage(langCode) === 'por';
}

function generatePlaceholder(message, duration) {
  return genPlaceholder(message, duration);
}

module.exports = { normalizeLang, normalizeLanguage, getLanguageName, isPortuguese, generatePlaceholder };