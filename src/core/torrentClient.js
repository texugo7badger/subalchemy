const { log } = require('../logger');

let clientInstance = null;
const activeTorrents = new Map(); // magnet -> Promise<Torrent>

async function getClient() {
    if (!clientInstance) {
        try {
            const WebTorrent = (await import('webtorrent')).default;
            // Usa MemoryStore (sem path) e desativa DHT/PEX para não estourar limite de portas UDP no Render
            clientInstance = new WebTorrent({ dht: false, pex: false, tracker: true });
            log('info', '[TorrentClient] WebTorrent client initialized (MemoryStore, DHT/PEX disabled).');
        } catch (e) {
            log('error', `[TorrentClient] Failed to init WebTorrent: ${e.message}`);
            return null;
        }
    }
    return clientInstance;
}

async function getTorrent(magnetLink) {
    if (activeTorrents.has(magnetLink)) {
        return activeTorrents.get(magnetLink);
    }

    const promise = (async () => {
        const client = await getClient();
        if (!client) throw new Error('WebTorrent client not available');

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout adding torrent'));
                activeTorrents.delete(magnetLink);
            }, 15000);

            try {
                client.add(magnetLink, {}, (torrent) => {
                    clearTimeout(timeout);
                    // Limpa da memória após 5 minutos para liberar RAM
                    setTimeout(() => {
                        try { torrent.destroy(); } catch(e) {}
                        activeTorrents.delete(magnetLink);
                    }, 300000);
                    resolve(torrent);
                });
            } catch (err) {
                clearTimeout(timeout);
                reject(err);
            }
        });
    })();

    activeTorrents.set(magnetLink, promise);
    return promise;
}

module.exports = { getTorrent };