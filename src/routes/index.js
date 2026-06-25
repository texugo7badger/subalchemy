const stremio = require('./stremio');
const proxy = require('./proxy');
const configure = require('./configure');
const configApi = require('./configApi');
const configRestore = require('./configRestore');  // v2.4.5: /api/config/restore + /api/config/save
const health = require('./health');

module.exports = { stremio, proxy, configure, configApi, configRestore, health };
