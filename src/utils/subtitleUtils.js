const { log } = require('../logger');
const AdmZip = require('adm-zip');

let clientInstance = null;

async function getClient() {
    if (!clientInstance) {
        const WebTorrent = (await import('webtorrent')).default;
        clientInstance = new WebTorrent();
        log('info', '[Torrent] WebTorrent client initialized.');
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
    if (!lang) return 'eng';
    return LANG_MAP[lang.toLowerCase()] || lang.toLowerCase();
}

function detectLanguage(fileName, content) {
    const nameLower = (fileName || '').toLowerCase();
    if (/(por|pb|pt-br|ptbr|portuguese|português)/i.test(nameLower)) return 'pob';
    if (/(eng|english|en)/i.test(nameLower)) return 'eng';
    
    if (content) {
        const text = content.substring(0, 2000).toLowerCase();
        const ptWords = ['você', 'não', 'está', 'também', 'porque', 'isso', 'então', 'olá', 'obrigado', 'sim'];
        const enWords = ['you', 'the', 'are', 'this', 'that', 'with', 'have', 'hello', 'thank', 'yes'];
        const ptCount = ptWords.filter(w => text.includes(w)).length;
        const enCount = enWords.filter(w => text.includes(w)).length;
        if (ptCount > enCount && ptCount > 2) return 'pob';
        if (enCount > ptCount && enCount > 2) return 'eng';
    }
    return 'eng';
}

async function extractSubs(torrentSource) {
    try {
        const client = await getClient();
        
        return await new Promise((resolve) => {
            let resolved = false;
            const timeout = 20000; // 20s por torrent

            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    log('warn', `[Torrent] Timeout extracting subs`);
                    resolve([]);
                }
            }, timeout);

            try {
                client.add(torrentSource, { path: '/tmp' }, (torrent) => {
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
            } catch (err) {
                log('error', `[Torrent] WebTorrent add error: ${err.message}`);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve([]);
                }
            }
        });
    } catch (err) {
        log('error', `[Torrent] Failed to get client: ${err.message}`);
        return [];
    }
}

module.exports = { normalizeLang, detectLanguage, extractSubs };