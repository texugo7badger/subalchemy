class InflightCache {
  constructor() {
    this.cache = new Map();
  }

  async getOrFetch(key, fetchFn) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    const promise = fetchFn().finally(() => this.cache.delete(key));
    this.cache.set(key, promise);
    return promise;
  }
}

module.exports = InflightCache;