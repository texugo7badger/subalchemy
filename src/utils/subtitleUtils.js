const { log } = require('../logger');

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
    return 'eng'; // Fallback
}

async function extractSubsFromMagnet(magnetLink) {
    let client;
    try {
        // CORREÇÃO: Usar import dinâmico para resolver o erro ESM do webtorrent
        const WebTorrent = (await import('webtorrent')).default;
        client = new WebTorrent();
        
        return await new Promise((resolve) => {
            const timeout = 20000; // 20 segundos
            let resolved = false;

            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    log('warn', `[Torrent] Timeout extracting subs from magnet`);
                    if (client) client.destroy();
                    resolve([]);
                }
            }, timeout);

            client.add(magnetLink, { path: '/tmp' }, (torrent) => {
                const subtitleFiles = torrent.files.filter(file => 
                    /\.(ass|ssa|srt|vtt)$/i.test(file.name)
                );
                
                if (subtitleFiles.length === 0) {
                    if (!resolved) { 
                        resolved = true; 
                        clearTimeout(timer); 
                        torrent.destroy(); 
                        client.destroy();
                        resolve([]); 
                    }
                    return;
                }
                
                const subs = [];
                let completed = 0;
                
                subtitleFiles.forEach((file) => {
                    file.getBuffer((err, buffer) => {
                        if (!err) {
                            const content = buffer.toString('utf-8');
                            subs.push({
                                fileName: file.name,
                                content: content,
                                format: file.name.split('.').pop().toLowerCase(),
                                language: detectLanguage(file.name, content)
                            });
                        }
                        completed++;
                        if (completed === subtitleFiles.length) {
                            if (!resolved) {
                                resolved = true;
                                clearTimeout(timer);
                                torrent.destroy();
                                client.destroy();
                                resolve(subs);
                            }
                        }
                    });
                });
            });
        });
    } catch (err) {
        log('error', `[Torrent] WebTorrent error: ${err.message}`);
        return [];
    } finally {
        if (client) client.destroy();
    }
}

module.exports = { normalizeLang, detectLanguage, extractSubsFromMagnet };