const { log } = require('../logger');
const AdmZip = require('adm-zip');

let clientInstance = null;
const activeTorrents = new Map(); // sourceKey -> Promise

async function getClient() {
    if (!clientInstance) {
        try {
            const WebTorrent = (await import('webtorrent')).default;
            // Desativa DHT e PEX para não abrir múltiplas portas UDP no Render
            clientInstance = new WebTorrent({ dht: false, pex: false, tracker: true });
            log('info', '[Torrent] WebTorrent client initialized (DHT/PEX disabled).');
        } catch (e) {
            log('error', `[Torrent] Failed to init WebTorrent: ${e.message}`);
            return null;
        }
    }
    return clientInstance;
}

/**
 * Normaliza os códigos de idioma do Ironclad e Erai-raws para o padrão ISO 639-2/B do Stremio
 */
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

function detectLanguageFromTrackName(trackName) {
    return normalizeLanguage(trackName);
}

function detectLanguageFromContent(content) {
    if (!content) return null;
    const sample = content.slice(0, 10000).toLowerCase();
    const ptWords = ['você', 'não', 'está', 'também', 'porque', 'isso', 'então', 'olá', 'obrigado', 'sim', 'eu', 'nós', 'eles', 'com', 'para', 'por', 'mas', 'que'];
    let ptCount = 0;
    for (const word of ptWords) {
        if (sample.includes(word)) ptCount++;
    }
    if (ptCount > 5) return 'por';
    
    const enWords = ['you', 'the', 'are', 'this', 'that', 'with', 'have', 'hello', 'thank', 'yes', 'and', 'of', 'to', 'for'];
    let enCount = 0;
    for (const word of enWords) {
        if (sample.includes(word)) enCount++;
    }
    if (enCount > 5) return 'eng';
    
    return null;
}

function detectLanguage(fileName, content) {
    return detectLanguageFromTrackName(fileName) || detectLanguageFromContent(content) || 'eng';
}

function generatePlaceholder(message, duration = 10) {
    return `1
00:00:00,000 --> 00:00:${String(duration).padStart(2, '0')},000
 ${message}

2
00:00:${String(duration).padStart(2, '0')},000 --> 00:00:${String(duration + 5).padStart(2, '0')},000
Subtitles will be loaded soon...`;
}

async function extractSubs(torrentSource) {
    const sourceKey = typeof torrentSource === 'string' ? torrentSource : torrentSource.toString('hex');
    
    if (activeTorrents.has(sourceKey)) {
        log('warn', `[Torrent] Duplicate torrent skipped, waiting for existing: ${sourceKey.substring(0, 20)}...`);
        return activeTorrents.get(sourceKey);
    }

    const promise = (async () => {
        const client = await getClient();
        if (!client) return [];

        return new Promise((resolve) => {
            let resolved = false;
            const timeout = 25000;

            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    log('warn', `[Torrent] Timeout extracting subs`);
                    resolve([]);
                }
            }, timeout);

            try {
                const torrent = client.add(torrentSource, { path: '/tmp' });
                
                torrent.on('infoHash', () => {
                    if (resolved) try { torrent.destroy(); } catch(e) {}
                });

                torrent.on('metadata', () => {
                    if (resolved) {
                        try { torrent.destroy(); } catch(e) {}
                        return;
                    }
                    
                    const targetFiles = torrent.files.filter(file => 
                        /\.(ass|ssa|srt|vtt|zip)$/i.test(file.name)
                    );
                    
                    if (targetFiles.length === 0) {
                        if (!resolved) { 
                            resolved = true; 
                            clearTimeout(timer); 
                            torrent.destroy(); 
                            resolve([]); 
                        }
                        return;
                    }
                    
                    const subs = [];
                    let completed = 0;
                    
                    targetFiles.forEach((file) => {
                        file.getBuffer((err, buffer) => {
                            if (!err && !resolved) {
                                if (file.name.toLowerCase().endsWith('.zip')) {
                                    try {
                                        const zip = new AdmZip(buffer);
                                        zip.getEntries().forEach(entry => {
                                            if (/\.(ass|ssa|srt|vtt)$/i.test(entry.entryName)) {
                                                const content = entry.getData().toString('utf-8');
                                                subs.push({
                                                    fileName: entry.entryName,
                                                    content: content,
                                                    format: entry.entryName.split('.').pop().toLowerCase(),
                                                    language: detectLanguage(entry.entryName, content)
                                                });
                                            }
                                        });
                                    } catch (e) {
                                        log('warn', `[Torrent] Failed to extract zip: ${e.message}`);
                                    }
                                } else {
                                    const content = buffer.toString('utf-8');
                                    subs.push({
                                        fileName: file.name,
                                        content: content,
                                        format: file.name.split('.').pop().toLowerCase(),
                                        language: detectLanguage(file.name, content)
                                    });
                                }
                            }
                            completed++;
                            if (completed === targetFiles.length) {
                                if (!resolved) {
                                    resolved = true;
                                    clearTimeout(timer);
                                    torrent.destroy();
                                    resolve(subs);
                                }
                            }
                        });
                    });
                });

                torrent.on('error', (err) => {
                    log('warn', `[Torrent] Torrent error: ${err.message}`);
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        resolve([]);
                    }
                });

            } catch (err) {
                log('error', `[Torrent] WebTorrent add error: ${err.message}`);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve([]);
                }
            }
        });
    })();

    activeTorrents.set(sourceKey, promise);
    try {
        return await promise;
    } finally {
        activeTorrents.delete(sourceKey);
    }
}

module.exports = { normalizeLanguage, isPortuguese, detectLanguageFromTrackName, detectLanguageFromContent, detectLanguage, generatePlaceholder, extractSubs };