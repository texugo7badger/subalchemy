const { log } = require('../logger');
const AdmZip = require('adm-zip');

let clientInstance = null;
const activeTorrents = new Set(); // Previne torrents duplicados simultâneos

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

const LANG_MAP = {
    'pt-br': 'pob', 'ptbr': 'pob', 'portuguese-brazil': 'pob', 'pb': 'pob', 'pt': 'pob', 'por': 'pob', 'portuguese': 'pob', 'português': 'pob',
    'en': 'eng', 'english': 'eng', 'eng': 'eng',
    'es': 'spa', 'spanish': 'spa',
    'fr': 'fra', 'french': 'fra',
    'ja': 'jpn', 'japanese': 'jpn',
    'zh': 'zho', 'chinese': 'zho'
};

function normalizeLang(lang) {
    if (!lang) return null;
    return LANG_MAP[lang.toLowerCase()] || lang.toLowerCase();
}

function isPortuguese(langCode) {
    const normalized = normalizeLang(langCode);
    return ['pob', 'por', 'pb', 'pt'].includes(normalized);
}

function detectLanguageFromFileName(fileName) {
    const nameLower = (fileName || '').toLowerCase();
    if (/(por|pb|pt-br|ptbr|portuguese|português)/i.test(nameLower)) return 'pob';
    if (/(eng|english|en)/i.test(nameLower)) return 'eng';
    return null;
}

function detectLanguageFromContent(content) {
    if (!content) return null;
    const sample = content.slice(0, 5000).toLowerCase(); // primeiros 5KB
    const ptWords = ['eu', 'você', 'nós', 'eles', 'elas', 'com', 'para', 'por', 'mas', 'que', 'está', 'não', 'sim'];
    let ptCount = 0;
    for (const word of ptWords) {
        if (sample.includes(word)) ptCount++;
    }
    if (ptCount > 4) return 'pob';
    
    const enWords = ['the', 'and', 'of', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'in', 'that', 'this', 'you'];
    let enCount = 0;
    for (const word of enWords) {
        if (sample.includes(word)) enCount++;
    }
    if (enCount > 4) return 'eng';
    
    return null;
}

function detectLanguage(fileName, content) {
    return detectLanguageFromFileName(fileName) || detectLanguageFromContent(content) || 'eng';
}

async function extractSubs(torrentSource) {
    const sourceKey = typeof torrentSource === 'string' ? torrentSource : torrentSource.toString('hex');
    
    if (activeTorrents.has(sourceKey)) {
        log('warn', `[Torrent] Duplicate torrent skipped: ${sourceKey.substring(0, 20)}...`);
        return [];
    }
    activeTorrents.add(sourceKey);

    const client = await getClient();
    if (!client) {
        activeTorrents.delete(sourceKey);
        return [];
    }

    return new Promise((resolve) => {
        let resolved = false;
        const timeout = 25000;

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                log('warn', `[Torrent] Timeout extracting subs`);
                activeTorrents.delete(sourceKey);
                resolve([]);
            }
        }, timeout);

        try {
            const torrent = client.add(torrentSource, { path: '/tmp', disableTracker: false });
            
            torrent.on('infoHash', () => {
                if (resolved) {
                    try { torrent.destroy(); } catch(e) {}
                }
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
                        activeTorrents.delete(sourceKey);
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
                                activeTorrents.delete(sourceKey);
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
                    activeTorrents.delete(sourceKey);
                    resolve([]);
                }
            });

        } catch (err) {
            log('error', `[Torrent] WebTorrent add error: ${err.message}`);
            if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                activeTorrents.delete(sourceKey);
                resolve([]);
            }
        }
    });
}

module.exports = { normalizeLang, isPortuguese, detectLanguage, extractSubs };