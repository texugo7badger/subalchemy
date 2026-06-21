function normalizeLanguage(langCode) {
    if (!langCode) return null;
    const normalized = langCode.toLowerCase().trim();
    
    // Português (Erai-raws: Brazilian_CR | Ironclad: POR-BR)
    if (normalized.includes('brazilian') || normalized.includes('por-br') || normalized.includes('por_br') || normalized.includes('portuguese') || normalized.startsWith('por') || normalized.startsWith('pt')) return 'por';
    
    // Inglês (Erai-raws: English_CR | Ironclad: ENG)
    if (normalized.includes('english') || normalized.startsWith('eng') || normalized === 'en') return 'eng';
    
    // Espanhol (Erai-raws: Latin_America_CR, Spanish_CR | Ironclad: SPA-LA, SPA)
    if (normalized.includes('latin_america') || normalized.includes('spa-la') || normalized.includes('spanish') || normalized.startsWith('spa') || normalized.startsWith('esp')) return 'spa';
    
    // Árabe (Erai-raws: Arabic_CR | Ironclad: ARA)
    if (normalized.includes('arabic') || normalized.startsWith('ara')) return 'ara';
    
    // Francês (Erai-raws: French_CR | Ironclad: FRE)
    if (normalized.includes('french') || normalized.startsWith('fre') || normalized.startsWith('fra')) return 'fra';
    
    // Alemão (Erai-raws: German_CR | Ironclad: GER)
    if (normalized.includes('german') || normalized.startsWith('ger') || normalized.startsWith('deu')) return 'deu';
    
    // Italiano (Erai-raws: Italian_CR | Ironclad: ITA)
    if (normalized.includes('italian') || normalized.startsWith('ita')) return 'ita';
    
    // Russo (Erai-raws: Russian_CR | Ironclad: RUS)
    if (normalized.includes('russian') || normalized.startsWith('rus')) return 'rus';
    
    // Indonésio (Ironclad: IND)
    if (normalized.includes('indonesian') || normalized.startsWith('ind')) return 'ind';
    
    // Tailandês (Ironclad: THA)
    if (normalized.includes('thai') || normalized.startsWith('tha')) return 'tha';
    
    // Chinês Tradicional (Ironclad: CHI-TR)
    if (normalized.includes('chi-tr') || normalized.includes('traditional')) return 'zht';
    
    // Chinês (Ironclad: CHI)
    if (normalized.includes('chinese') || normalized.startsWith('chi') || normalized.startsWith('zho')) return 'zho';
    
    // Vietnamita (Ironclad: VIE)
    if (normalized.includes('vietnamese') || normalized.startsWith('vie')) return 'vie';
    
    // Malaio (Ironclad: MAY)
    if (normalized.includes('malay') || normalized.startsWith('may')) return 'may';
    
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