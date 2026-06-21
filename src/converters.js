// src/converters.js
const { compile } = require('ass-compiler');

function formatTime(seconds) {
    const ms = Math.floor((seconds % 1) * 1000);
    const totalSec = Math.floor(seconds);
    const s = totalSec % 60;
    const m = Math.floor((totalSec / 60) % 60);
    const h = Math.floor(totalSec / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function vttToSrt(vttContent) {
    return vttContent
        .replace(/^WEBVTT.*$/m, '')
        .replace(/NOTE.*\n.*\n/g, '')
        .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2')
        .replace(/(\d{2}:\d{2})\.(\d{3})/g, '00:$1,$2')
        .replace(/<[^>]+>/g, '')
        .replace(/^\s*[\r\n]/gm, '')
        .trim();
}

function assToSrt(assContent) {
    try {
        const data = compile(assContent);
        let srt = '';
        let index = 1;
        data.events.dialogue.forEach(line => {
            const start = formatTime(line.Start);
            const end = formatTime(line.End);
            let text = line.Text.combined.replace(/{\\[^}]+}/g, '').replace(/\\N/g, '\n').trim();
            if (text) {
                srt += `${index}\n${start} --> ${end}\n${text}\n\n`;
                index++;
            }
        });
        return srt.trim();
    } catch (e) { return null; }
}

module.exports = { vttToSrt, assToSrt };