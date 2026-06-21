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

async function extractSubtitles(magnetLink, timeout = 30000) {
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
            
            // BLINDAGEM: Verifica se o torrent e os arquivos existem
            if (!torrent || !torrent.files || torrent.files.length === 0) {
                clearTimeout(timeoutId);
                if (!resolved) { resolved = true; resolve([]); }
                return;
            }

            // Encontra o maior arquivo .mkv
            const videoFile = torrent.files.find(f => f.name.toLowerCase().endsWith('.mkv'));
            if (!videoFile) {
                clearTimeout(timeoutId);
                if (!resolved) { resolved = true; resolve([]); }
                return;
            }

            // OTIMIZAÇÃO: Baixa apenas os primeiros 10MB do arquivo.
            const stream = videoFile.createReadStream({ start: 0, end: 10485760 });
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
                    if (subtitlesByTrack[track.number] && subtitlesByTrack[track.number].length > 0) {
                        const content = subtitlesByTrack[track.number].join('\n');
                        results.push({
                            language: track.language || track.name || 'eng',
                            content: content,
                            format: 'srt',
                            trackNumber: track.number
                        });
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