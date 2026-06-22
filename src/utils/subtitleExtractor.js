const { log } = require('../logger');
const { getTorrent } = require('../core/torrentClient');
const { SubtitleParser } = require('matroska-subtitles');
const { normalizeLanguage, isPortuguese } = require('./subtitleUtils');

function formatTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

async function extractSubtitles(magnetLink, requestedLangs = ['por', 'eng'], timeout = 30000) {
    log('info', `[SubtitleExtractor] Starting extraction for ${magnetLink.substring(0, 30)}...`);
    
    return new Promise(async (resolve) => {
        let resolved = false;
        let stream;
        let parser;

        const finish = (results) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeoutId);
            if (stream) stream.destroy();
            if (parser) parser.destroy();
            log('info', `[SubtitleExtractor] Extraction finished. Found ${results.length} valid subs.`);
            resolve(results);
        };

        const timeoutId = setTimeout(() => {
            log('warn', `[SubtitleExtractor] Timeout (${timeout}s) reached.`);
            finish([]);
        }, timeout);

        try {
            const torrent = await getTorrent(magnetLink);
            if (!torrent || !torrent.files || torrent.files.length === 0) return finish([]);
            
            const videoFile = torrent.files.find(f => f.name.toLowerCase().endsWith('.mkv'));
            if (!videoFile) return finish([]);

            // Não limita o end, pois precisamos do cabeçalho completo do MKV
            stream = videoFile.createReadStream();
            parser = new SubtitleParser();
            
            const tracksInfo = [];
            const subtitlesByTrack = {};

            parser.once('tracks', (tracks) => {
                tracks.forEach(t => {
                    // Usa o nome da faixa se o language code estiver vazio
                    const langSource = t.language || t.name || 'eng';
                    t.detectedLang = normalizeLanguage(langSource);
                    tracksInfo.push(t);
                });
                log('info', `[SubtitleExtractor] MKV Tracks found: ${tracksInfo.map(t => `${t.number}:${t.detectedLang}`).join(', ')}`);
            });

            parser.on('subtitle', (subtitle, trackNumber) => {
                const track = tracksInfo.find(t => t.number === trackNumber);
                if (!track) return;

                // Se a faixa for de um idioma que o usuário quer...
                if (requestedLangs.includes(track.detectedLang)) {
                    if (!subtitlesByTrack[trackNumber]) subtitlesByTrack[trackNumber] = [];
                    
                    const startTime = formatTime(subtitle.time);
                    const endTime = formatTime(subtitle.time + subtitle.duration);
                    const text = subtitle.text || '';
                    
                    subtitlesByTrack[trackNumber].push(`${startTime} --> ${endTime}\n${text}\n`);

                    // OTIMIZAÇÃO: Se já pegamos 100 linhas de legenda, já temos o suficiente.
                    // Destruímos a stream para parar o download e retornar rápido (Autofit do release).
                    if (subtitlesByTrack[trackNumber].length >= 100) {
                        const results = [];
                        for (const tNum in subtitlesByTrack) {
                            const tInfo = tracksInfo.find(t => t.number === parseInt(tNum));
                            results.push({
                                language: tInfo.detectedLang,
                                content: subtitlesByTrack[tNum].join('\n'),
                                format: 'srt',
                                trackNumber: parseInt(tNum)
                            });
                        }
                        finish(results);
                    }
                }
            });

            stream.on('end', () => {
                const results = [];
                tracksInfo.forEach(track => {
                    if (subtitlesByTrack[track.number] && subtitlesByTrack[track.number].length > 0) {
                        results.push({
                            language: track.detectedLang,
                            content: subtitlesByTrack[track.number].join('\n'),
                            format: 'srt',
                            trackNumber: track.number
                        });
                    }
                });
                finish(results);
            });

            stream.on('error', (err) => {
                log('error', `[SubtitleExtractor] Stream error: ${err.message}`);
                finish([]);
            });

            stream.pipe(parser);

        } catch (error) {
            log('error', `[SubtitleExtractor] Failed: ${error.message}`);
            finish([]);
        }
    });
}

module.exports = { extractSubtitles };