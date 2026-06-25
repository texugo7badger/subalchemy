/**
 * SubtitleStore — in-memory cache for converted SRT content.
 *
 * v2.4.5: Added LRU eviction + TTL to prevent unbounded memory growth on
 * long-running containers. Previous version stored entries forever, which
 * caused slow RAM creep on heavy-use deployments.
 *
 * Limits (tuned for a typical 512MB container):
 *   - MAX_ENTRIES: 500  (each entry is ~10–80KB of SRT text → ~50MB max)
 *   - TTL_MS:      1h   (Stremio usually re-fetches within minutes, not
 *                        hours; subs served an hour ago are unlikely to
 *                        be needed again and can be safely evicted)
 *
 * The subId (md5 of the source URL) is content-addressed, so re-fetching
 * an evicted entry simply re-runs the conversion pipeline — the user
 * perceives at most a ~500ms delay.
 */
class SubtitleStore {
  constructor() {
    this.store = new Map();
    this.MAX_ENTRIES = 500;
    this.TTL_MS = 60 * 60 * 1000; // 1 hour
  }

  /**
   * Store a converted SRT. Evicts the oldest entry if at capacity.
   * @param {string} id - subId (md5 of source URL)
   * @param {{content: string, lang: string}} data
   */
  set(id, data) {
    // LRU eviction: if we're at capacity, delete the oldest entry.
    // Map preserves insertion order, so the first key is the oldest.
    if (this.store.size >= this.MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(id, { ...data, _ts: Date.now() });
  }

  /**
   * Retrieve a cached SRT. Returns undefined if missing OR expired.
   * Touching an entry moves it to the end of the Map (most-recently-used).
   * @param {string} id
   * @returns {{content: string, lang: string}|undefined}
   */
  get(id) {
    const entry = this.store.get(id);
    if (!entry) return undefined;

    // TTL check
    if (Date.now() - entry._ts > this.TTL_MS) {
      this.store.delete(id);
      return undefined;
    }

    // LRU touch: re-insert at end of Map (most-recently-used position).
    this.store.delete(id);
    this.store.set(id, entry);

    // Return without the internal _ts field.
    const { _ts, ...publicData } = entry;
    return publicData;
  }

  /**
   * Force eviction of all expired entries. Called opportunistically by
   * the proxy route every N requests to keep memory tight.
   * @returns {number} Number of entries evicted
   */
  evictExpired() {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of this.store) {
      if (now - entry._ts > this.TTL_MS) {
        this.store.delete(key);
        evicted++;
      }
    }
    return evicted;
  }

  /**
   * Current entry count (for /health diagnostics).
   * @returns {number}
   */
  size() {
    return this.store.size;
  }
}

module.exports = new SubtitleStore(); // Singleton
