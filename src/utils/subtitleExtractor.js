const { log } = require('../logger');
const { getTorrent } = require('../core/torrentClient');
const { SubtitleParser } = require('matroska-subtitles');

function formatTime(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

async function extractSubtitles(magnetLink, requestedLangs = ['por', 'eng'], timeout = 45000) {
    log('info', `[SubtitleExtractor] Starting extraction for ${magnetLink.substring(0, 30)}...`);
    
    return new Promise(async (resolve) => {
        let resolved = false;
        const timeoutId = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                log('warn', `[SubtitleExtractor] Timeout (${timeout}s) reached.`);
                resolve([]);
            }
        }, timeout);

        try {
            const torrent = await getTorrent(magnetLink);
            
            // Encontra o maior arquivo .mkv (geralmente o vídeo)
            const videoFile = torrent.files.reduce((prev, curr) => {
                return prev && prev.length > curr.length ? prev : curr;
            }, null);

            if (!videoFile || !videoFile.name.toLowerCase().endsWith('.mkv')) {
                clearTimeout(timeoutId);
                if (!resolved) { resolved = true; resolve([]); }
                return;
            }

            const stream = videoFile.createReadStream();
            const parser = new SubtitleParser();
            
            const tracksInfo = [];
            const subtitlesByTrack = {};

            parser.once('tracks', (tracks) => {
                tracks.forEach(t => tracksInfo.push(t));
                log('info', `[SubtitleExtractor] Found ${tracks.length} subtitle tracks.`);
            });

            parser.on('subtitle', (subtitle, trackNumber) => {
                if (!subtitlesByTrack[trackNumber]) subtitlesByTrack[trackNumber] = [];
                
                const startTime = formatTime(subtitle.time);
                const endTime = formatTime(subtitle.time + subtitle.duration);
                const text = subtitle.text || '';
                
                subtitlesByTrack[trackNumber].push(`${startTime} --> ${endTime}\n${text}\n`);
            });

            stream.on('end', () => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeoutId);
                
                const results = [];
                tracksInfo.forEach(track => {
                    const trackLang = (track.language || 'eng').toLowerCase();
                    const normalizedLang = trackLang.startsWith('pt') ? 'por' : trackLang;
                    
                    if (subtitlesByTrack[track.number] && subtitlesByTrack[track.number].length > 0) {
                        // Se o idioma da faixa está na lista de desejados
                        if (requestedLangs.includes(normalizedLang)) {
                            const content = subtitlesByTrack[track.number].join('\n');
                            results.push({
                                language: normalizedLang,
                                content: content,
                                format: 'srt',
                                trackNumber: track.number
                            });
                        }
                    }
                });
                
                log('info', `[SubtitleExtractor] Extraction finished. Found ${results.length} valid subs.`);
                resolve(results);
            });

            stream.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    log('error', `[SubtitleExtractor] Stream error: ${err.message}`);
                    resolve([]);
                }
            });

            stream.pipe(parser);

        } catch (error) {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeoutId);
                log('error', `[SubtitleExtractor] Failed: ${error.message}`);
                resolve([]);
            }
        }
    });
}

module.exports = { extractSubtitles };