const { log } = require('../logger');
const InflightCache = require('../cache/InflightCache');

const DEFAULT_DEADLINE_MS = parseInt(process.env.PROVIDER_DEADLINE_MS, 10) || 10000;

/**
 * Manages all subtitle providers: registration, parallel search, and deduplication.
 */
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

  /**
   * Search all enabled providers in parallel with per-provider deadline.
   * Results are deduplicated by (source, language, format, releaseName).
   * Individual provider failures never abort the batch.
   * @param {object} query - The search query
   * @returns {Promise<{subtitles: SubtitleResult[]}>}
   */
  async searchAll(query) {
    const key = this._dedupeKey(query);
    return this.inflight.getOrFetch(key, () => this._doSearch(query));
  }

  _dedupeKey(query) {
    // Create a stable cache key from the query
    return `${query.imdbId || ''}|${query.searchQuery || ''}|${query.season || ''}|${query.episode || ''}|${(query.languages || []).join(',')}`;
  }

  async _doSearch(query) {
    const providers = this.getEnabled();
    if (providers.length === 0) {
      log('warn', '[ProviderManager] No enabled providers.');
      return { subtitles: [] };
    }

    log('info', `[ProviderManager] Searching ${providers.length} providers...`);

    const results = await Promise.all(
      providers.map(p => this._raceWithDeadline(p, query))
    );

    // Aggregate all subtitle results
    const allSubtitles = [];
    for (const r of results) {
      if (r.subtitles && r.subtitles.length > 0) {
        allSubtitles.push(...r.subtitles);
      }
    }

    log('info', `[Providers] Found ${allSubtitles.length} total subtitles before dedupe.`);
    return { subtitles: this._dedupe(allSubtitles) };
  }

  /**
   * Race a provider call against a deadline timeout.
   * On timeout or error, returns { subtitles: [] } — never throws.
   * @param {BaseProvider} provider
   * @param {object} query
   * @returns {Promise<{subtitles: SubtitleResult[]}>}
   */
  _raceWithDeadline(provider, query) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        log('warn', `[${provider.name}] Exceeded ${DEFAULT_DEADLINE_MS}ms deadline.`);
        resolve({ subtitles: [] });
      }, DEFAULT_DEADLINE_MS);

      const startTime = Date.now();

      provider.search(query)
        .then(res => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const elapsed = Date.now() - startTime;
          const count = res?.subtitles?.length || 0;
          log('debug', `[${provider.name}] Completed in ${elapsed}ms, returned ${count} results.`);
          resolve(res || { subtitles: [] });
        })
        .catch(err => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          log('warn', `[${provider.name}] Error: ${err.message}`);
          resolve({ subtitles: [] });
        });
    });
  }

  /**
   * Deduplicate subtitle results by (source, language, format, releaseName).
   * @param {SubtitleResult[]} subtitles
   * @returns {SubtitleResult[]}
   */
  _dedupe(subtitles) {
    const seen = new Set();
    return subtitles.filter(sub => {
      // Build a deduplication key from semantic fields
      const key = `${sub.source}|${sub.language}|${sub.format}|${sub.releaseName}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

module.exports = new ProviderManager(); // Singleton