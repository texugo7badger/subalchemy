const { head, header, apiKeyField, languageSelector, installButton, freeSources, footer } = require('./components');

/**
 * Render the /configure page HTML.
 *
 * v2.4.5 (configure-restore): the page is served with a subalchemy_uid
 * cookie (see routes/configure.js). The browser-side app.js calls
 * /api/config/restore on boot to fetch any previously-saved config and
 * pre-fill the form. No server-side injection of secrets into the HTML —
 * the restore happens client-side via fetch, which keeps the page
 * cacheable and avoids leaking secrets in HTML that might be cached by
 * intermediaries.
 */
function getConfigureHTML() {
  return `
<!DOCTYPE html>
<html lang="en">
 ${head()}
<body>
    <div class="container">
        ${header()}

        ${apiKeyField({ id: 'subdlApiKey', label: 'SubDL API Key', tooltipText: 'Great alternative source for movies and series.', getLinkUrl: 'https://subdl.com/panel/api', linkText: 'Get SubDL API Key' })}

        ${apiKeyField({ id: 'subsourceApiKey', label: 'SubSource API Key', tooltipText: 'Community-driven subtitle source.', getLinkUrl: 'https://subsource.net/', linkText: 'Get SubSource API Key' })}

        ${apiKeyField({ id: 'wyzieApiKey', label: 'Wyzie API Key', tooltipText: 'Free API, excellent for anime.', getLinkUrl: 'https://store.wyzie.io/redeem', linkText: 'Get Wyzie API Key' })}

        ${languageSelector()}

        ${installButton()}

        ${freeSources()}

        ${footer()}
    </div>
    <script src="/assets/app.js?v=2.4.5"></script>
</body>
</html>
  `;
}

module.exports = { getConfigureHTML };
