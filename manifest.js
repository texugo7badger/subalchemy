const packageJson = require('./package.json');

/**
 * Generate the Stremio addon manifest.
 *
 * @param {object} [config={}] - Decoded user config (apiKeys, languages).
 *                               When non-empty, the addon is considered
 *                               configured and `configurationRequired`
 *                               is removed so Stremio stops nagging.
 * @returns {object} Stremio manifest
 */
function generateManifest(config = {}) {
  const languages = config.languages
    ? (Array.isArray(config.languages) ? config.languages : config.languages.split(','))
    : [];
  const langDisplay = languages.length > 0 ? ` (${languages.join(', ')})` : '';

  const hasConfig = config && Object.keys(config).length > 0 &&
    (config.subdlApiKey || config.subsourceApiKey || config.wyzieApiKey || config.languages);

  return {
    id: "org.subalchemy.addon",
    version: packageJson.version,
    name: "SubAlchemy",
    // Logo is served from our own Express static route (/assets/) so it
    // always works regardless of GitHub raw cache or path changes.
    // Using RENDER_EXTERNAL_URL ensures the absolute URL is correct on Render.
    logo: `${process.env.RENDER_EXTERNAL_URL || ''}/assets/subalchemy-logo.png`,
    background: "https://images.unsplash.com/photo-1570284613060-766c33850e00?q=80&w=1470&auto=format&fit=crop",
    description: `Universal SRT Converter for Tizen 9 & Anime${langDisplay}. Fetches subtitles from 5 sources and converts VTT/ASS/ZIP to SRT on the fly.`,
    resources: ["subtitles"],
    types: ["movie", "series"],
    idPrefixes: ["tt", "kitsu"],
    catalogs: [],
    behaviorHints: {
      // `configurable: true` is what makes Stremio show the "Configure"
      // button on an installed addon. This MUST stay true regardless of
      // whether the user has already configured — otherwise they can't
      // ever change their keys/languages.
      configurable: true,
      // `configurationRequired` is only true when the user has NOT yet
      // configured. Once they install with config, we remove this flag so
      // Stremio knows the addon is ready to serve subtitles.
      configurationRequired: !hasConfig
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