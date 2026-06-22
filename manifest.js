const packageJson = require('./package.json');

function generateManifest(config = {}) {
  const languages = config.languages ? config.languages.split(',') : [];
  const langDisplay = languages.length > 0 ? ` (${languages.join(', ')})` : '';
  
  return {
    id: "org.subalchemy.addon",
    version: packageJson.version,
    name: "SubAlchemy",
    logo: "https://raw.githubusercontent.com/texugo7badger/subalchemy/main/subalchemy-logo.png",
    background: "https://images.unsplash.com/photo-1570284613060-766c33850e00?q=80&w=1470&auto=format&fit=crop",
    description: `Universal SRT Converter for Tizen 9 & Anime${langDisplay}. Fetches subtitles and anime streams (Nyaa/NekoBT).`,
    resources: ["subtitles", "stream"],
    types: ["movie", "series", "anime"],
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