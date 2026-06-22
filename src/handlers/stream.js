const { parseStremioId } = require('../utils');
const { log } = require('../logger');
const { getCinemetaTitle } = require('../meta/cinemeta');
const { getKitsuTitle } = require('../meta/kitsu');
const NyaaStreamProvider = require('../streamProviders/NyaaStreamProvider');
const NekoBTStreamProvider = require('../streamProviders/NekoBTStreamProvider');

async function handleStreamRequest(args) {
    const { type, id } = args;
    let streams = [];
    
    let title = null;
    const parsed = parseStremioId(id);
    if (parsed.kitsuId) {
        title = await getKitsuTitle(parsed.kitsuId);
    } else if (parsed.imdbId) {
        title = await getCinemetaTitle(parsed.imdbId, type);
    }

    if (!title) return { streams: [] };
    log('info', `[StreamHandler] Searching streams for: ${title}`);

    const nyaaProvider = new NyaaStreamProvider();
    const nekoProvider = new NekoBTStreamProvider();

    // Busca em paralelo
    const [nyaaStreams, nekoStreams] = await Promise.all([
        nyaaProvider.getStreams(title),
        nekoProvider.getStreams(title)
    ]);

    streams = [...nyaaStreams, ...nekoStreams];

    log('info', `[StreamHandler] Returning ${streams.length} total streams to Stremio.`);
    return { streams };
}

module.exports = { handleStreamRequest };