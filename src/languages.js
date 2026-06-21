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

function normalizeLang(lang) {
  if (!lang) return 'eng';
  return LANG_MAP[lang.toLowerCase()] || lang;
}

function toAlpha2(code) {
  const entry = Object.entries(LANG_MAP).find(([, v]) => v === code);
  return entry ? entry[0] : code;
}

module.exports = { normalizeLang, toAlpha2 };