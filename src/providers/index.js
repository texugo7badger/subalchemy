const providerManager = require('./ProviderManager');
const OpenSubtitlesProvider = require('./OpenSubtitlesProvider');
const SubDLProvider = require('./SubDLProvider');
const WyzieProvider = require('./WyzieProvider');
const AnimeToshoProvider = require('./AnimeToshoProvider');
const NyaaProvider = require('./NyaaProvider');
const NekoBTProvider = require('./NekoBTProvider');

function registerDefaultProviders() {
  providerManager.register(new OpenSubtitlesProvider());
  providerManager.register(new SubDLProvider());
  providerManager.register(new WyzieProvider());
  providerManager.register(new AnimeToshoProvider());
  providerManager.register(new NyaaProvider());
  providerManager.register(new NekoBTProvider());
}

module.exports = { providerManager, registerDefaultProviders };