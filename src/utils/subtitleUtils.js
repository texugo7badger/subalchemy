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

module.exports = { normalizeLanguage, isPortuguese };