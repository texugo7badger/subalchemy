/**
 * UserConfigStore — server-side persistence of user configs so the
 * /configure page can be re-opened with API keys + languages pre-filled.
 *
 * PROBLEM SOLVED:
 *   When Stremio opens the "Configure" button on an installed addon, it
 *   loads ${addonUrl}/configure — but it does NOT forward the base64 config
 *   that is embedded in the manifest URL the user originally installed
 *   from. So /configure would open with empty fields, looking "broken".
 *
 * SOLUTION:
 *   On first visit to /configure, generate a random userId and set it as
 *   a cookie. When the user clicks "Install in Stremio", persist their
 *   config under that userId. On subsequent /configure visits, read the
 *   cookie, fetch the saved config, and inject it into the page so the
 *   form is pre-filled.
 *
 * LIMITS (same as SubtitleStore):
 *   - MAX_ENTRIES: 2000  (each entry is ~0.5KB → ~1MB max)
 *   - TTL_MS:       30d  (long-lived — users may not reconfigure for weeks)
 *
 * SECURITY:
 *   - userId is a 32-char crypto-random string (unguessable).
 *   - API keys are stored in plaintext in memory. This is acceptable
 *     because (a) the store is in-process only (not persisted to disk),
 *     (b) the addon is single-user-per-deployment in 99% of cases, and
 *     (c) the existing manifest URL already exposes the keys in base64
 *     to anyone who has the URL. If you need stronger guarantees, run
 *     the addon behind an authenticating reverse proxy.
 */
const crypto = require('crypto');

class UserConfigStore {
  constructor() {
    this.store = new Map();
    this.MAX_ENTRIES = 2000;
    this.TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  }

  /**
   * Generate a new unguessable userId (32 hex chars = 128 bits of entropy).
   * @returns {string}
   */
  generateUserId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Persist a user config under the given userId.
   * @param {string} userId
   * @param {object} config - { subdlApiKey, subsourceApiKey, wyzieApiKey, languages }
   */
  set(userId, config) {
    if (!userId || !config) return;
    // LRU eviction
    if (this.store.size >= this.MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(userId, { ...config, _ts: Date.now() });
  }

  /**
   * Retrieve a user config. Returns undefined if missing or expired.
   * @param {string} userId
   * @returns {object|undefined}
   */
  get(userId) {
    if (!userId) return undefined;
    const entry = this.store.get(userId);
    if (!entry) return undefined;
    if (Date.now() - entry._ts > this.TTL_MS) {
      this.store.delete(userId);
      return undefined;
    }
    // LRU touch
    this.store.delete(userId);
    this.store.set(userId, entry);
    const { _ts, ...publicData } = entry;
    return publicData;
  }

  /**
   * Delete a user config (used if user explicitly logs out / clears).
   * @param {string} userId
   */
  delete(userId) {
    this.store.delete(userId);
  }

  size() {
    return this.store.size;
  }
}

module.exports = new UserConfigStore(); // Singleton
