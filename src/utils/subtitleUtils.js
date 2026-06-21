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

function detectLanguageFromFileName(fileName) {
    const nameLower = (fileName || '').toLowerCase();
    if (/(por|pb|pt-br|ptbr|portuguese|português)/i.test(nameLower)) return 'por';
    if (/(eng|english|en)/i.test(nameLower)) return 'eng';
    return null;
}

function detectLanguageFromContent(content) {
    if (!content) return null;
    const sample = content.slice(0, 10000).toLowerCase(); // primeiros 10KB
    const ptWords = ['eu', 'você', 'nós', 'eles', 'elas', 'com', 'para', 'por', 'mas', 'que', 'e', 'a', 'o', 'de', 'em', 'um', 'uma', 'dos', 'das', 'se', 'me', 'te', 'lhe', 'nos', 'vos'];
    let ptCount = 0;
    for (const word of ptWords) {
        if (sample.includes(word)) ptCount++;
    }
    if (ptCount > 5) return 'por';
    
    const enWords = ['the', 'and', 'of', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'in', 'that', 'this'];
    let enCount = 0;
    for (const word of enWords) {
        if (sample.includes(word)) enCount++;
    }
    if (enCount > 5) return 'eng';
    
    return null;
}

function detectLanguage(fileName, content) {
    return detectLanguageFromFileName(fileName) || detectLanguageFromContent(content) || 'eng';
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

module.exports = { normalizeLanguage, isPortuguese, detectLanguage, generatePlaceholder, extractSubs };