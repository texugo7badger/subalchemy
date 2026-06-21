const providerManager = require('./ProviderManager');
const OpenSubtitlesProvider = require('./OpenSubtitlesProvider');
const SubDLProvider = require('./SubDLProvider');
const WyzieProvider = require('./WyzieProvider');
const AnimeToshoProvider = require('./AnimeToshoProvider');
const EraiRawsProvider = require('./EraiRawsProvider'); // Novo provider

function registerDefaultProviders() {
  providerManager.register(new OpenSubtitlesProvider());
  providerManager.register(new SubDLProvider());
  providerManager.register(new WyzieProvider());
  providerManager.register(new AnimeToshoProvider());
  providerManager.register(new EraiRawsProvider()); // Registra o erai-raws
}

module.exports = { providerManager, registerDefaultProviders };