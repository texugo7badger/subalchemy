const providerManager = require('./ProviderManager');
const OpenSubtitlesProvider = require('./OpenSubtitlesProvider');
const SubDLProvider = require('./SubDLProvider');
const WyzieProvider = require('./WyzieProvider');
const AnimeToshoProvider = require('./AnimeToshoProvider');
const NyaaProvider = require('./NyaaProvider'); // Novo
const NekoBTProvider = require('./NekoBTProvider'); // Novo

function registerDefaultProviders() {
  providerManager.register(new OpenSubtitlesProvider());
  providerManager.register(new SubDLProvider());
  providerManager.register(new WyzieProvider());
  providerManager.register(new AnimeToshoProvider());
  providerManager.register(new NyaaProvider()); // Registra Nyaa
  providerManager.register(new NekoBTProvider()); // Registra NekoBT
}

module.exports = { providerManager, registerDefaultProviders };