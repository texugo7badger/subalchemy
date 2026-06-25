// Available languages — v2.4.5 (23 languages total)
//   - Portuguese: Brazil (pt-br), Portugal (pt-pt), generic (pt)
//   - 12 originals
//   - Balkan pack: Serbian, Croatian, Bosnian, Slovenian, Bulgarian, Greek
//   - Additional 5: Turkish, Polish, Dutch, Hebrew, Vietnamese
const availableLangs = [
  // Portuguese — split into Brazil, Portugal, and generic
  'pt-br', 'pt-pt', 'pt',
  // Major 12
  'en', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'zh-tw', 'ru', 'ar', 'hi', 'ko',
  // Balkan pack (v2.4.5)
  'sr', 'hr', 'bs', 'sl', 'bg', 'el',
  // Additional 5 (v2.4.5)
  'tr', 'pl', 'nl', 'he', 'vi'
];

const langNames = {
  // Portuguese
  'pt-br': 'Portuguese (Brazil)',
  'pt-pt': 'Portuguese (Portugal)',
  'pt': 'Portuguese',
  // Major
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'ja': 'Japanese',
  'zh': 'Chinese (Simplified)',
  'zh-tw': 'Chinese (Traditional)',
  'ru': 'Russian',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'ko': 'Korean',
  // Balkan
  'sr': 'Serbian',
  'hr': 'Croatian',
  'bs': 'Bosnian',
  'sl': 'Slovenian',
  'bg': 'Bulgarian',
  'el': 'Greek',
  // Additional
  'tr': 'Turkish',
  'pl': 'Polish',
  'nl': 'Dutch',
  'he': 'Hebrew',
  'vi': 'Vietnamese'
};

let selectedLangs = ['en'];

function renderTags() {
    const container = document.getElementById('selectedLangs');
    container.innerHTML = '';
    selectedLangs.forEach(lang => {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = langNames[lang] + ' <span class="remove" onclick="removeLang(\''+lang+'\')">&times;</span>';
        container.appendChild(tag);
    });
}

function removeLang(lang) {
    selectedLangs = selectedLangs.filter(l => l !== lang);
    renderTags();
}

function filterLangs() {
    const search = document.getElementById('langSearch').value.toLowerCase();
    const list = document.getElementById('langList');
    list.innerHTML = '';
    const filtered = availableLangs.filter(l => langNames[l].toLowerCase().includes(search) && !selectedLangs.includes(l));
    if (filtered.length > 0) {
        list.style.display = 'block';
        filtered.forEach(l => {
            const item = document.createElement('div');
            item.className = 'lang-item';
            item.innerText = langNames[l] + ' (' + l + ')';
            item.onclick = () => {
                if (selectedLangs.length >= 3) {
                    alert('You can select a maximum of 3 languages.');
                    return;
                }
                selectedLangs.push(l);
                document.getElementById('langSearch').value = '';
                list.style.display = 'none';
                renderTags();
            };
            list.appendChild(item);
        });
    } else {
        list.style.display = 'none';
    }
}

async function testAPI(type) {
    const inputId = type + 'ApiKey';
    const btn = event.target;
    const key = document.getElementById(inputId).value.trim();
    if (!key) return;
    btn.innerText = '...';
    btn.className = 'test-btn';
    try {
        const res = await fetch('/api/test-api?type=' + type + '&key=' + key);
        const data = await res.json();
        if (data.valid) {
            btn.innerText = 'Valid!';
            btn.className = 'test-btn valid';
        } else {
            const errText = data.error ? data.error.substring(0, 12) : 'Invalid!';
            btn.innerText = errText;
            btn.title = data.error || 'Invalid API Key';
            btn.className = 'test-btn invalid';
        }
    } catch (e) {
        btn.innerText = 'Error!';
        btn.className = 'test-btn invalid';
    }
}

/**
 * v2.4.5 (configure-restore): persist the current config server-side
 * BEFORE redirecting to stremio://, so the next time the user opens
 * /configure from Stremio's "Configure" button we can pre-fill the form.
 *
 * We POST the config to /api/config/save (which stores it under the
 * subalchemy_uid cookie set by the server). The endpoint returns quickly
 * so the redirect below is not perceptibly delayed.
 */
async function saveConfig(configObj) {
    try {
        await fetch('/api/config/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configObj),
        });
    } catch (e) {
        // Non-fatal — the install redirect below will still work; we
        // just won't be able to restore the form next time.
        console.warn('[SubAlchemy] saveConfig failed (non-fatal):', e);
    }
}

async function installAddon() {
    const subdlKey = document.getElementById('subdlApiKey').value.trim();
    const subsourceKey = document.getElementById('subsourceApiKey').value.trim();
    const wyzieKey = document.getElementById('wyzieApiKey').value.trim();
    const langs = selectedLangs.join(',');

    const configObj = {
        subdlApiKey: subdlKey,
        subsourceApiKey: subsourceKey,
        wyzieApiKey: wyzieKey,
        languages: langs
    };

    // Remove chaves vazias
    Object.keys(configObj).forEach(k => (configObj[k] === '' || configObj[k] === null) && delete configObj[k]);

    // v2.4.5: persist server-side so /configure can be reopened with the
    // form pre-filled. Fire-and-await — the redirect is gated on this so
    // we don't lose the save if the user's browser closes the tab quickly.
    await saveConfig(configObj);

    // Codifica a configuração em Base64 para colocar na URL
    const configStr = btoa(JSON.stringify(configObj));
    const baseUrl = window.location.origin;
    const manifestUrl = `${baseUrl}/${configStr}/manifest.json`;

    window.location.href = 'stremio://' + manifestUrl.replace('https://', '').replace('http://', '');
}

/**
 * v2.4.5 (configure-restore): on page boot, try to fetch any saved config
 * from the server (keyed by the subalchemy_uid cookie). If found, pre-
 * fill the API key fields and language tags so the user sees their
 * previous configuration instead of an empty form.
 *
 * This is what fixes the "Configure button in Stremio shows empty page"
 * bug — Stremio opens ${addonUrl}/configure with no params, but our
 * server-set cookie + /api/config/restore endpoint lets the page
 * reconstruct the user's previous state.
 */
async function restoreConfig() {
    try {
        const res = await fetch('/api/config/restore');
        if (!res.ok) return;  // 404 = no saved config, nothing to restore
        const data = await res.json();
        if (!data.found || !data.config) return;

        const c = data.config;
        if (c.subdlApiKey)     document.getElementById('subdlApiKey').value = c.subdlApiKey;
        if (c.subsourceApiKey) document.getElementById('subsourceApiKey').value = c.subsourceApiKey;
        if (c.wyzieApiKey)     document.getElementById('wyzieApiKey').value = c.wyzieApiKey;

        if (c.languages) {
            const langs = typeof c.languages === 'string'
                ? c.languages.split(',').map(s => s.trim()).filter(Boolean)
                : c.languages;
            // Only accept langs we actually know about (filters out any
            // stale codes from older versions).
            const valid = langs.filter(l => availableLangs.includes(l) || langNames[l]);
            if (valid.length > 0) {
                selectedLangs = valid.slice(0, 3);
                renderTags();
            }
        }
    } catch (e) {
        // Non-fatal — page just opens with empty fields, same as before.
        console.warn('[SubAlchemy] restoreConfig failed (non-fatal):', e);
    }
}

// Initialize on load — restore first (async), then render tags.
renderTags();
restoreConfig();
