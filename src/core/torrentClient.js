const { log } = require('../logger');

let clientInstance = null;
const activeTorrents = new Map(); // infoHash -> Promise<Torrent>

async function getClient() {
    if (!clientInstance) {
        try {
            const WebTorrent = (await import('webtorrent')).default;
            clientInstance = new WebTorrent({ dht: false, pex: false, tracker: true });
            
            // BLINDAGEM: Captura erros globais do WebTorrent para não derrubar o Node.js
            clientInstance.on('error', (err) => {
                log('warn', `[TorrentClient] WebTorrent global error suppressed: ${err.message}`);
            });
            
            log('info', '[TorrentClient] WebTorrent client initialized (MemoryStore, DHT/PEX disabled).');
        } catch (e) {
            log('error', `[TorrentClient] Failed to init WebTorrent: ${e.message}`);
            return null;
        }
    }
    return clientInstance;
}

function extractInfoHash(magnetLink) {
    const match = magnetLink.match(/btih:([a-fA-F0-9]{40})/);
    return match ? match[1].toLowerCase() : magnetLink;
}

async function getTorrent(magnetLink) {
    const client = await getClient();
    if (!client) throw new Error('WebTorrent client not available');

    const infoHash = extractInfoHash(magnetLink);
    
    // 1. Verifica no próprio WebTorrent se já tem e se está pronto
    const existingTorrent = client.get(infoHash);
    if (existingTorrent && existingTorrent.ready) {
        return existingTorrent;
    }
    
    // 2. Verifica no nosso cache de promessas
    if (activeTorrents.has(infoHash)) {
        return activeTorrents.get(infoHash);
    }

    const promise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout adding torrent (metadata)'));
            activeTorrents.delete(infoHash);
        }, 20000);

        try {
            const torrent = client.add(magnetLink, { dht: false, pex: false });
            
            const onReady = () => {
                clearTimeout(timeout);
                torrent.removeListener('error', onError);
                // Limpa da memória após 5 minutos
                setTimeout(() => {
                    try { torrent.destroy(); } catch(e) {}
                    activeTorrents.delete(infoHash);
                }, 300000);
                resolve(torrent);
            };

            const onError = (err) => {
                log('warn', `[TorrentClient] Torrent error suppressed: ${err.message}`);
                clearTimeout(timeout);
                activeTorrents.delete(infoHash);
                try { torrent.destroy(); } catch(e) {}
                reject(err);
            };

            torrent.once('ready', onReady);
            torrent.once('error', onError);

        } catch (err) {
            clearTimeout(timeout);
            reject(err);
        }
    });

    activeTorrents.set(infoHash, promise);
    return promise;
}

module.exports = { getTorrent };