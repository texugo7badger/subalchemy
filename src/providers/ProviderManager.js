const { log } = require('../logger');
const InflightCache = require('../cache/InflightCache');

const DEFAULT_DEADLINE_MS = parseInt(process.env.PROVIDER_DEADLINE_MS, 10) || 8000;

class ProviderManager {
  constructor() {
    this.providers = new Map();
    this.inflight = new InflightCache();
  }

  register(provider) {
    this.providers.set(provider.name, provider);
    log('info', `[ProviderManager] Registered: ${provider.name}`);
  }

  getEnabled() {
    return Array.from(this.providers.values()).filter(p => p.enabled);
  }

  async searchAll(query) {
    const key = this._dedupeKey(query);
    return this.inflight.getOrFetch(key, () => this._doSearch(query));
  }

  async _doSearch(query) {
    const providers = this.getEnabled();
    if (providers.length === 0) return { subtitles: [] };

    const results = await Promise.all(
      providers.map(p => this._raceWithDeadline(p, query))
    );

    const allSubtitles = [];
    for (const r of results) {
      if (r.subtitles && r.subtitles.length > 0) allSubtitles.push(...r.subtitles);
    }

    log('info', `[Providers] Found ${allSubtitles.length} total subtitles before dedupe.`);
    return { subtitles: this._dedupe(allSubtitles) };
  }

  _raceWithDeadline(provider, query) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        log('warn', `[ProviderManager] ${provider.name} exceeded ${DEFAULT_DEADLINE_MS}ms`);
        resolve({ subtitles: [] });
      }, DEFAULT_DEADLINE_MS);

      provider.search(query)
        .then(res => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(res || { subtitles: [] });
        })
        .catch(err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          log('error', `[ProviderManager] ${provider.name} failed: ${err.message}`);
          resolve({ subtitles: [] });
        });
    });
  }

  _dedupeKey(query) {
    return `${query.imdbId || query.kitsuId}:${query.season || '-'}:${query.episode || '-'}:${(query.languages || []).join(',')}`;
  }

  _dedupe(subtitles) {
    const seen = new Set();
    return subtitles.filter(sub => {
      if (seen.has(sub.url)) return false;
      seen.add(sub.url);
      return true;
    });
  }
}

module.exports = new ProviderManager();