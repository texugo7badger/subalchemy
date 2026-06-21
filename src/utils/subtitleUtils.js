function normalizeLanguage(langCode) {
    if (!langCode) return null;
    const normalized = langCode.toLowerCase().trim();
    const portugueseCodes = ['por', 'pt', 'pt-br', 'pt-pt', 'pob', 'portuguese', 'português', 'pb'];
    if (portugueseCodes.includes(normalized)) return 'por';
    if (normalized.startsWith('pt')) return 'por';
    
    const englishCodes = ['eng', 'en', 'english'];
    if (englishCodes.includes(normalized)) return 'eng';
    
    return normalized;
}

function isPortuguese(langCode) {
    return normalizeLanguage(langCode) === 'por';
}

function generatePlaceholder(message, duration = 10) {
    return `1
00:00:00,000 --> 00:00:${String(duration).padStart(2, '0')},000
 ${message}

2
00:00:${String(duration).padStart(2, '0')},000 --> 00:00:${String(duration + 5).padStart(2, '0')},000
Subtitles will be loaded soon...`;
}

module.exports = { normalizeLanguage, isPortuguese, generatePlaceholder };