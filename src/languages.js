/**
 * Language helpers — thin re-export layer over utils/subtitleUtils.js.
 *
 * Kept as a separate module because providers historically import from
 * '../languages' (e.g. OpenSubtitlesProvider, SubDLProvider,
 * SubsourceProvider). All real logic lives in subtitleUtils.js so there
 * is exactly one source of truth for language normalization across the
 * project.
 */
const {
  normalizeLanguage,
  normalizeLang,
  getLanguageName,
  isPortuguese,
  generatePlaceholder,
  formatSrtTime,
  LANG_MAP,
  LANG_NAMES,
} = require('./utils/subtitleUtils');

module.exports = {
  normalizeLanguage,
  normalizeLang,
  getLanguageName,
  isPortuguese,
  generatePlaceholder,
  formatSrtTime,
  LANG_MAP,
  LANG_NAMES,
};