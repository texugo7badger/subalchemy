class SubtitleStore {
  constructor() {
    this.store = new Map();
  }

  set(id, data) {
    this.store.set(id, data);
  }

  get(id) {
    return this.store.get(id);
  }
}

module.exports = new SubtitleStore(); // Singleton