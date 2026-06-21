const packageJson = require('./package.json');

function generateManifest(config = {}) {
  const languages = config.languages || [];
  const langDisplay = languages.length > 0 ? ` (${languages.join(', ')})` : '';
  
  return {
    id: "org.subalchemy.addon",
    version: packageJson.version,
    name: "SubAlchemy",
    logo: `${process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 7000}`}/assets/subalchemy-logo.png`,
    description: `Universal SRT Converter for Tizen 9 & Anime${langDisplay}. Fetches from multiple sources and converts VTT/ASS/ZIP to SRT.`,
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [],
    behaviorHints: {
      configurable: true,
      configurationRequired: true
    },
    config: [
      { key: 'subdlApiKey', type: 'string', title: 'SubDL API Key (Optional)', default: process.env.SUBDL_API_KEY || '' },
      { key: 'subsourceApiKey', type: 'string', title: 'SubSource API Key (Optional)', default: process.env.SUBSOURCE_API_KEY || '' },
      { key: 'wyzieApiKey', type: 'string', title: 'Wyzie API Key (Optional)', default: process.env.WYZIE_API_KEY || '' },
      { key: 'languages', type: 'string', title: 'Languages (e.g., en,pt-br,es)', default: 'en,pt-br,es,fr,de,it,ja,zh,ru,ar,hi,ko' }
    ]
  };
}

module.exports = { generateManifest };