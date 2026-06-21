const WebTorrent = require('webtorrent');
const { log } = require('../logger');

const client = new WebTorrent();

// Mapeamento de idiomas para normalização
const LANG_MAP = {
    'pt-br': 'pob', 'ptbr': 'pob', 'portuguese-brazil': 'pob', 'pb': 'pob', 'pt': 'pob', 'por': 'pob', 'portuguese': 'pob', 'português': 'pob',
    'en': 'eng', 'english': 'eng', 'eng': 'eng',
    'es': 'spa', 'spanish': 'spa', 'español': 'spa',
    'fr': 'fra', 'french': 'fra', 'français': 'fra',
    'ja': 'jpn', 'japanese': 'jpn',
    'zh': 'zho', 'chinese': 'zho'
};

function normalizeLang(lang) {
    if (!lang) return 'eng';
    return LANG_MAP[lang.toLowerCase()] || lang.toLowerCase();
}

function detectLanguage(fileName, content) {
    // 1. Tenta pelo nome do arquivo
    const nameLower = (fileName || '').toLowerCase();
    const ptRegex = /(por|pb|pt-br|ptbr|portuguese|português)/i;
    if (ptRegex.test(nameLower)) return 'pob';
    
    const enRegex = /(eng|english|en)/i;
    if (enRegex.test(nameLower)) return 'eng';

    // 2. Tenta pelo conteúdo (análise das primeiras linhas)
    if (content) {
        const text = content.substring(0, 2000).toLowerCase();
        const ptWords = ['você', 'não', 'está', 'também', 'porque', 'isso', 'então', 'olá', 'obrigado', 'sim'];
        const enWords = ['you', 'the', 'are', 'this', 'that', 'with', 'have', 'hello', 'thank', 'yes'];
        
        const ptCount = ptWords.filter(w => text.includes(w)).length;
        const enCount = enWords.filter(w => text.includes(w)).length;
        
        if (ptCount > enCount && ptCount > 2) return 'pob';
        if (enCount > ptCount && enCount > 2) return 'eng';
    }
    
    return null; // Desconhecido
}

function extractSubsFromMagnet(magnetLink) {
    return new Promise((resolve) => {
        const timeout = 20000; // 20 segundos de timeout
        let resolved = false;

        const timer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                log('warn', `[Torrent] Timeout extracting subs from magnet`);
                resolve([]);
            }
        }, timeout);

        try {
            client.add(magnetLink, { path: '/tmp' }, (torrent) => {
                const subtitleFiles = torrent.files.filter(file => 
                    /\.(ass|ssa|srt|vtt)$/i.test(file.name)
                );
                
                if (subtitleFiles.length === 0) {
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
                                resolve(subs);
                            }
                        }
                    });
                });
            });
        } catch (err) {
            log('error', `[Torrent] WebTorrent error: ${err.message}`);
            if (!resolved) { 
                resolved = true; 
                clearTimeout(timer); 
                resolve([]); 
            }
        }
    });
}

module.exports = { normalizeLang, detectLanguage, extractSubsFromMagnet };