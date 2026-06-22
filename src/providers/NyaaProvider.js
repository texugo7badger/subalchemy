const { BaseProvider } = require('./BaseProvider');

class NyaaProvider extends BaseProvider {
  constructor() {
    super('NyaaSI', { enabled: false }); // Desativado pois WebTorrent não funciona no Render
  }

  async search(query) {
    return { subtitles: [] };
  }
}

module.exports = NyaaProvider;