const { head, header, apiKeyField, languageSelector, installButton, freeSources, footer } = require('./components');

function getConfigureHTML(baseUrl) {
  return `
<!DOCTYPE html>
<html lang="en">
 ${head()}
<body>
    <div class="container">
        ${header()}
        
        ${apiKeyField({ id: 'subdlApiKey', label: 'SubDL API Key', tooltipText: 'Great alternative source for movies and series.', getLinkUrl: 'https://subdl.com/panel/api', linkText: 'Get SubDL API Key' })}
        
        ${apiKeyField({ id: 'subsourceApiKey', label: 'SubSource API Key', tooltipText: 'Community-driven subtitle source.', getLinkUrl: 'https://subsource.net/', linkText: 'Get SubSource API Key' })}
        
        ${apiKeyField({ id: 'wyzieApiKey', label: 'Wyzie API Key', tooltipText: 'Free API, excellent for anime.', getLinkUrl: 'https://github.com/wyzie/Subs', linkText: 'Get Wyzie API Key' })}

        ${languageSelector()}

        ${installButton()}

        ${freeSources()}

        ${footer()}
    </div>
    <script>
        window.baseUrl = "${baseUrl}";
    </script>
    <script src="/assets/app.js"></script>
</body>
</html>
  `;
}

module.exports = { getConfigureHTML };