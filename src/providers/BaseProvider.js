class BaseProvider {
  constructor(name, options = {}) {
    if (this.constructor === BaseProvider) throw new Error('BaseProvider is abstract');
    this.name = name;
    this.enabled = options.enabled !== false;
  }

  async search(_query) {
    throw new Error(`${this.name}.search() not implemented`);
  }

  getSources() {
    return [this.name];
  }
}

class SubtitleResult {
  constructor({ id, url, language, source, fileName = null, format = 'srt', needsConversion = false, releaseName = '' }) {
    this.id = id;
    this.url = url;
    this.language = language; // ISO 639-2/B (e.g., pob, eng)
    this.source = source;
    this.fileName = fileName;
    this.format = format; // 'srt', 'vtt', 'ass', 'zip'
    this.needsConversion = needsConversion;
    this.releaseName = releaseName;
  }
}

module.exports = { BaseProvider, SubtitleResult };