function normalizeLanguage(langCode) {
    if (!langCode) return null;
    const normalized = langCode.toLowerCase().trim();
    
    // Português (Erai-raws: Brazilian_CR | Ironclad: POR-BR)
    if (normalized.includes('brazilian') || normalized.includes('por-br') || normalized.includes('por_br') || normalized.includes('portuguese') || normalized.startsWith('por') || normalized.startsWith('pt')) return 'por';
    
    // Inglês
    if (normalized.includes('english') || normalized.startsWith('eng') || normalized === 'en') return 'eng';
    
    // Espanhol
    if (normalized.includes('latin_america') || normalized.includes('spa-la') || normalized.includes('spanish') || normalized.startsWith('spa') || normalized.startsWith('esp')) return 'spa';
    
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