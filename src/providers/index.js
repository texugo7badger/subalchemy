const providerManager = require('./ProviderManager');
const OpenSubtitlesProvider = require('./OpenSubtitlesProvider');
const SubDLProvider = require('./SubDLProvider');
const WyzieProvider = require('./WyzieProvider');
const AnimeToshoProvider = require('./AnimeToshoProvider');

function registerDefaultProviders() {
  providerManager.register(new OpenSubtitlesProvider());
  providerManager.register(new SubDLProvider());
  providerManager.register(new WyzieProvider());
  providerManager.register(new AnimeToshoProvider());
}

module.exports = { providerManager, registerDefaultProviders };