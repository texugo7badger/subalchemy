/**
 * Universal subtitle language utilities.
 *
 * Single source of truth for language normalization across the entire
 * SubAlchemy provider stack. Supports 23 languages (v2.4.5):
 *   - Portuguese: Brazil (pob), Portugal (ptg), generic (por)
 *   - 12 originals: English, Spanish, French, German, Italian, Japanese,
 *     Chinese (Simplified + Traditional), Russian, Arabic, Hindi, Korean
 *   - Balkan pack: Serbian, Croatian, Bosnian, Slovenian, Bulgarian, Greek
 *   - Additional 5: Turkish, Polish, Dutch, Hebrew, Vietnamese
 *
 * Used by:
 *   - src/handlers/subtitles.js    (filtering + fallback + sync scoring)
 *   - src/languages.js             (re-exports for backward compat)
 *   - src/providers/AnimeToshoProvider.js
 *   - src/providers/WyzieProvider.js
 *
 * Output codes follow ISO 639-2/B so they round-trip cleanly with
 * OpenSubtitles, SubDL, Wyzie and SubSource responses.
 *
 * Portuguese split (v2.4.5):
 *   - 'pob' → Portuguese (Brazil)        — explicit Brazilian variant
 *   - 'ptg' → Portuguese (Portugal)      — explicit European variant
 *   - 'por' → Portuguese (generic)       — provider didn't qualify the
 *                                          variant; labeled as just
 *                                          "Portuguese". The handler
 *                                          treats 'por' as Brazil-friendly
 *                                          fallback (most providers default
 *                                          to pob under 'por').
 */

// ---- Mapping table ---------------------------------------------------------
// Keys are case-insensitive aliases the user or providers may send. Values
// are the canonical ISO 639-2/B codes we use everywhere internally.
const LANG_MAP = {
  // Portuguese (Brazil) — explicit variant
  'pt-br': 'pob', 'ptbr': 'pob', 'portuguese-brazil': 'pob', 'pb': 'pob',
  'pob': 'pob', 'por-br': 'pob', 'por_br': 'pob',
  'brazilian': 'pob', 'brazilian_cr': 'pob', 'portuguesebr': 'pob',
  'portuguese-br': 'pob', 'pt_br': 'pob',

  // Portuguese (Portugal) — explicit European variant
  'pt-pt': 'ptg', 'ptpt': 'ptg', 'portuguese-portugal': 'ptg',
  'ptg': 'ptg', 'por-pt': 'ptg', 'por_pt': 'ptg',
  'european portuguese': 'ptg', 'portuguese-pt': 'ptg', 'pt_pt': 'ptg',
  'portugal': 'ptg',

  // Portuguese (generic — provider didn't qualify the variant)
  'pt': 'por', 'por': 'por', 'portuguese': 'por',

  // English
  'en': 'eng', 'eng': 'eng', 'english': 'eng',

  // Spanish (incl. Latin American variants)
  'es': 'spa', 'spa': 'spa', 'spanish': 'spa',
  'esp': 'spa', 'spa-la': 'spa', 'latin_america': 'spa', 'latin american': 'spa',

  // French
  'fr': 'fra', 'fra': 'fra', 'fre': 'fra', 'french': 'fra',

  // German
  'de': 'deu', 'deu': 'deu', 'ger': 'deu', 'german': 'deu',

  // Italian
  'it': 'ita', 'ita': 'ita', 'italian': 'ita',

  // Japanese
  'ja': 'jpn', 'jpn': 'jpn', 'japanese': 'jpn',

  // Chinese (Simplified + Traditional)
  'zh': 'zho', 'zho': 'zho', 'chinese': 'zho', 'zh-cn': 'zho',
  'zh-tw': 'zht', 'zht': 'zht',

  // Russian
  'ru': 'rus', 'rus': 'rus', 'russian': 'rus',

  // Arabic
  'ar': 'ara', 'ara': 'ara', 'arabic': 'ara',

  // Hindi
  'hi': 'hin', 'hin': 'hin', 'hindi': 'hin',

  // Korean
  'ko': 'kor', 'kor': 'kor', 'korean': 'kor',

  // ---- Balkan pack (v2.4.5) ----
  // Serbian
  'sr': 'srp', 'srp': 'srp', 'scc': 'srp', 'srb': 'srp', 'serbian': 'srp',
  // Croatian
  'hr': 'hrv', 'hrv': 'hrv', 'scr': 'hrv', 'cro': 'hrv', 'croatian': 'hrv',
  // Bosnian
  'bs': 'bos', 'bos': 'bos', 'bns': 'bos', 'bosnian': 'bos',
  // Slovenian
  'sl': 'slv', 'slv': 'slv', 'slo': 'slv', 'slovenian': 'slv',
  // Bulgarian
  'bg': 'bul', 'bul': 'bul', 'blg': 'bul', 'bulgarian': 'bul',
  // Greek
  'el': 'ell', 'ell': 'ell', 'gr': 'ell', 'gre': 'ell', 'greek': 'ell',

  // ---- Additional 5 languages (v2.4.5) ----
  // Turkish
  'tr': 'tur', 'tur': 'tur', 'turkish': 'tur',
  // Polish
  'pl': 'pol', 'pol': 'pol', 'polish': 'pol',
  // Dutch
  'nl': 'nld', 'nld': 'nld', 'dut': 'nld', 'dutch': 'nld',
  // Hebrew
  'he': 'heb', 'heb': 'heb', 'iw': 'heb', 'hebrew': 'heb',
  // Vietnamese
  'vi': 'vie', 'vie': 'vie', 'vietnamese': 'vie',
};

// Human-readable display names — used by the handler to build the Stremio
// subtitle label, e.g. "SubAlchemy [Portuguese (Brazil)]".
const LANG_NAMES = {
  'pob': 'Portuguese (Brazil)',
  'ptg': 'Portuguese (Portugal)',
  'por': 'Portuguese',
  'eng': 'English',
  'spa': 'Spanish',
  'fra': 'French',
  'deu': 'German',
  'ita': 'Italian',
  'jpn': 'Japanese',
  'zho': 'Chinese (Simplified)',
  'zht': 'Chinese (Traditional)',
  'rus': 'Russian',
  'ara': 'Arabic',
  'hin': 'Hindi',
  'kor': 'Korean',

  // Balkan pack
  'srp': 'Serbian',
  'hrv': 'Croatian',
  'bos': 'Bosnian',
  'slv': 'Slovenian',
  'bul': 'Bulgarian',
  'ell': 'Greek',

  // Additional 5
  'tur': 'Turkish',
  'pol': 'Polish',
  'nld': 'Dutch',
  'heb': 'Hebrew',
  'vie': 'Vietnamese',
};

/**
 * Normalize any language code, alias, or human name into a canonical
 * ISO 639-2/B code. Handles common fan-sub variants like "Brazilian_CR"
 * (Erai-raws), "POR-BR" (Ironclad) and "PT-PT" (Portugal fansubs).
 *
 * @param {string} langCode - Raw language string from config or provider.
 * @returns {string|null} Canonical code (e.g. 'pob', 'ptg', 'eng') or null
 *                        if the input is empty/unrecognized.
 */
function normalizeLanguage(langCode) {
  if (!langCode) return null;
  const normalized = String(langCode).toLowerCase().trim();

  // Direct lookup — covers all aliases defined in LANG_MAP
  if (LANG_MAP[normalized]) return LANG_MAP[normalized];

  // Substring fallbacks for fan-sub quirks like "Portuguese[BR] [por, ASS]"
  // or "Brazilian_CR" — providers may pass raw link text.
  // ORDER MATTERS: check more specific Portugal first, then Brazil, then
  // generic Portuguese — otherwise "Portuguese (Brazil)" matches the
  // generic branch first and we'd lose the variant.
  if (normalized.includes('portugal') ||
      normalized.includes('european portuguese') ||
      normalized.includes('pt-pt') ||
      normalized.includes('ptpt') ||
      normalized.includes('por-pt') ||
      normalized.includes('por_pt')) return 'ptg';

  if (normalized.includes('brazilian') ||
      normalized.includes('pt-br') ||
      normalized.includes('ptbr') ||
      normalized.includes('pt_br') ||
      normalized.includes('por-br') ||
      normalized.includes('por_br') ||
      normalized.includes('pob') ||
      normalized.includes('portuguesebr') ||
      normalized.includes('portuguese-br')) return 'pob';

  if (normalized.includes('portuguese') ||
      normalized.includes('por')) return 'por';

  if (normalized.includes('english')) return 'eng';

  if (normalized.includes('latin_america') ||
      normalized.includes('spa-la') ||
      normalized.includes('spanish')) return 'spa';

  if (normalized.includes('french')) return 'fra';
  if (normalized.includes('german')) return 'deu';
  if (normalized.includes('italian')) return 'ita';
  if (normalized.includes('japanese')) return 'jpn';
  if (normalized.includes('chinese')) return normalized.includes('traditional') ? 'zht' : 'zho';
  if (normalized.includes('russian')) return 'rus';
  if (normalized.includes('arabic')) return 'ara';
  if (normalized.includes('hindi')) return 'hin';
  if (normalized.includes('korean')) return 'kor';

  // Balkan substring fallbacks
  if (normalized.includes('serbian') || normalized.includes('srb') || normalized.includes('srp')) return 'srp';
  if (normalized.includes('croatian') || normalized.includes('hrv') || normalized.includes('scr')) return 'hrv';
  if (normalized.includes('bosnian') || normalized.includes('bos')) return 'bos';
  if (normalized.includes('slovenian') || normalized.includes('slv')) return 'slv';
  if (normalized.includes('bulgarian') || normalized.includes('bul')) return 'bul';
  if (normalized.includes('greek') || normalized.includes('ell')) return 'ell';

  // Additional 5
  if (normalized.includes('turkish') || normalized.includes('tur')) return 'tur';
  if (normalized.includes('polish') || normalized.includes('pol')) return 'pol';
  if (normalized.includes('dutch') || normalized.includes('nld')) return 'nld';
  if (normalized.includes('hebrew') || normalized.includes('heb')) return 'heb';
  if (normalized.includes('vietnamese') || normalized.includes('vie')) return 'vie';

  // Unknown — return lowercased input so callers can still group/compare
  // (e.g. an exotic language we don't have a display name for).
  return normalized;
}

/**
 * Alias for normalizeLanguage that defaults to English. Used by providers
 * that need a non-null code for SubtitleResult.language.
 * @param {string} langCode
 * @returns {string}
 */
function normalizeLang(langCode) {
  return normalizeLanguage(langCode) || 'eng';
}

/**
 * Get a human-readable display name for a canonical code.
 * Falls back to UPPERCASE code if unknown.
 * @param {string} code - Canonical ISO 639-2/B code
 * @returns {string}
 */
function getLanguageName(code) {
  const norm = normalizeLanguage(code);
  return LANG_NAMES[norm] || String(code).toUpperCase();
}

/**
 * Convenience predicate — true if the code normalizes to any Portuguese
 * variant (Brazil, Portugal, or generic). Kept for backward compatibility
 * with existing call sites.
 * @param {string} langCode
 * @returns {boolean}
 */
function isPortuguese(langCode) {
  const norm = normalizeLanguage(langCode);
  return norm === 'pob' || norm === 'ptg' || norm === 'por';
}

/**
 * Convenience predicate — true if the code is specifically Brazilian
 * Portuguese (pob) or generic Portuguese (por, which we treat as
 * Brazilian-friendly since most providers default to pob under 'por').
 * @param {string} langCode
 * @returns {boolean}
 */
function isBrazilianPortuguese(langCode) {
  const norm = normalizeLanguage(langCode);
  return norm === 'pob' || norm === 'por';
}

/**
 * Generate a minimal placeholder SRT for cases where no real subtitle was
 * found but the handler still wants to surface a message to the user.
 *
 * Produces a single-cue SRT spanning [0, duration] milliseconds.
 *
 * @param {string} message - Text to display in the cue.
 * @param {number} [duration=5000] - Cue duration in milliseconds.
 * @returns {string} Valid SRT body.
 */
function generatePlaceholder(message, duration = 5000) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 5000;
  const start = formatSrtTime(0);
  const end = formatSrtTime(safeDuration);
  return `1\n${start} --> ${end}\n${message}\n`;
}

/**
 * Format a millisecond offset as an SRT timestamp (HH:MM:SS,mmm).
 * @param {number} ms
 * @returns {string}
 */
function formatSrtTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const millis = ms % 1000;
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  const mm = String(millis).padStart(3, '0');
  return `${h}:${m}:${s},${mm}`;
}

module.exports = {
  normalizeLanguage,
  normalizeLang,
  getLanguageName,
  isPortuguese,
  isBrazilianPortuguese,
  generatePlaceholder,
  formatSrtTime,
  LANG_MAP,
  LANG_NAMES,
};
