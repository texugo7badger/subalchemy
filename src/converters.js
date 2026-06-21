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

// NOVA FUNÇÃO: Remove anúncios do OpenSubtitles e limpa linhas vazias
function removeAds(srtContent) {
    const adKeywords = [
        /open ?subtitles/i,
        /support us and become vip/i,
        /advertise your product/i,
        /www\.opensubtitles/i,
        /subtitles by/i,
        /sync.*corrected.*by/i,
        /resync/i
    ];

    // Divide o SRT em blocos (cada bloco é uma legenda)
    let blocks = srtContent.split(/\r?\n\r?\n/);
    let cleanBlocks = blocks.filter(block => {
        // Se o bloco contiver alguma das palavras de anúncio, removemos o bloco inteiro
        return !adKeywords.some(regex => regex.test(block));
    });

    // Reordena os números das legendas (já que removemos algumas)
    let index = 1;
    let finalSrt = cleanBlocks.map(block => {
        let lines = block.split(/\r?\n/);
        // O primeiro item do array é sempre o número, substituímos pelo novo index
        if (lines.length > 0 && !isNaN(parseInt(lines[0]))) {
            lines[0] = index.toString();
            index++;
        }
        return lines.join('\n');
    }).join('\n\n');

    return finalSrt.trim();
}

function vttToSrt(vttContent) {
    let srt = vttContent
        .replace(/^WEBVTT.*$/m, '')
        .replace(/NOTE.*\n.*\n/g, '')
        .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2')
        .replace(/(\d{2}:\d{2})\.(\d{3})/g, '00:$1,$2')
        .replace(/<[^>]+>/g, '')
        .replace(/^\s*[\r\n]/gm, '')
        .trim();

    return removeAds(srt); // Aplica a limpeza antes de retornar
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
        return removeAds(srt.trim()); // Aplica a limpeza antes de retornar
    } catch (e) { return null; }
}

module.exports = { vttToSrt, assToSrt };