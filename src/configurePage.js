// src/configurePage.js
function getConfigureHTML(baseUrl) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/png" href="/subalchemy-logo.png">
    <title>SubAlchemy Configuration</title>
    <style>
        /* Custom Magical Scrollbars */
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: #0f0c29; border-radius: 10px; }
        ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #8a2be2, #3f2b96); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #8a2be2; }
        html { scrollbar-width: thin; scrollbar-color: #8a2be2 #0f0c29; }

        body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f0c29 0%, #1a237e 50%, #28143e 100%);
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        .container {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 50px 40px;
            max-width: 500px;
            width: 90%;
            margin: 50px 0;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
            text-align: center;
        }
        .logo {
            width: 280px;
            margin-bottom: 20px;
            border-radius: 25px;
            box-shadow: 0 4px 15px rgba(138, 43, 226, 0.6);
        }
        h1 { margin: 0 0 10px 0; font-size: 2.5em; font-weight: 700; background: linear-gradient(to right, #a8c0ff, #3f2b96); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p.subtitle { margin-top: 0; color: #bbb; font-size: 1em; margin-bottom: 10px; }
        p.description { color: #a8c0ff; font-size: 0.85em; margin-bottom: 30px; line-height: 1.5; }
        p.description a { color: #fff; text-decoration: underline; font-weight: 600; display: inline-block; }
        
        .form-group { margin-bottom: 25px; text-align: left; }
        label { display: flex; align-items: center; margin-bottom: 8px; font-weight: 500; color: #ddd; }
        
        .tooltip {
            position: relative;
            display: inline-block;
            margin-left: 8px;
            cursor: pointer;
            color: #a8c0ff;
            font-weight: bold;
            font-size: 0.75em;
            border: 1px solid #a8c0ff;
            border-radius: 50%;
            width: 14px;
            height: 14px;
            line-height: 12px;
            text-align: center;
        }
        .tooltip .tooltiptext {
            visibility: hidden;
            width: 200px;
            background-color: rgba(0,0,0,0.9);
            color: #fff;
            text-align: center;
            border-radius: 6px;
            padding: 8px;
            position: absolute;
            z-index: 1;
            bottom: 125%;
            left: 50%;
            margin-left: -100px;
            opacity: 0;
            transition: opacity 0.3s;
            font-size: 0.9em;
            font-weight: normal;
        }
        .tooltip:hover .tooltiptext { visibility: visible; opacity: 1; }

        .input-wrapper { display: flex; gap: 10px; margin-bottom: 5px; }
        input[type="text"] {
            flex: 1; padding: 12px; border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(0, 0, 0, 0.4); color: #fff;
            font-size: 1em; transition: all 0.3s ease;
        }
        input[type="text"]:focus { outline: none; border-color: #8a2be2; box-shadow: 0 0 0 3px rgba(138, 43, 226, 0.3); }
        
        .test-btn {
            padding: 12px 15px; border-radius: 8px; border: none;
            background: #8a2be2; color: #fff;
            cursor: pointer; font-weight: 500; transition: all 0.3s ease; min-width: 70px;
        }
        .test-btn:hover { background: #a8c0ff; color: #000; }
        .test-btn.valid { background: #28a745; }
        .test-btn.valid:hover { background: #20c997; color: #000; }
        .test-btn.invalid { background: #dc3545; }
        .test-btn.invalid:hover { background: #f56565; color: #000; }

        .link { 
            display: inline-block; 
            font-size: 0.8em; 
            color: #a8c0ff; 
            text-decoration: none; 
            opacity: 0.8; 
            margin-top: 5px;
        }
        .link:hover { opacity: 1; text-decoration: underline; }

        .tags-container { background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; min-height: 45px; display: flex; flex-wrap: wrap; gap: 8px; align-content: center; }
        .tag { background: #8a2be2; padding: 5px 10px; border-radius: 15px; font-size: 0.85em; display: flex; align-items: center; gap: 5px; }
        .tag .remove { cursor: pointer; font-weight: bold; opacity: 0.7; }
        .tag .remove:hover { opacity: 1; }
        #langSearch { width: 100%; margin-top: 10px; box-sizing: border-box; }
        #langList { margin-top: 10px; max-height: 150px; overflow-y: auto; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; display: none; }
        .lang-item { padding: 10px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .lang-item:hover { background: rgba(138, 43, 226, 0.3); }

        .install-btn {
            width: 100%; padding: 15px; border-radius: 10px; border: none;
            background: linear-gradient(45deg, #8a2be2, #6a0dad);
            color: white; font-size: 1.3em; font-weight: 700; cursor: pointer;
            margin-top: 20px; transition: transform 0.2s, box-shadow 0.2s;
            box-shadow: 0 4px 15px rgba(138, 43, 226, 0.4);
        }
        .install-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(138, 43, 226, 0.6); }
        
        .donation { margin-top: 35px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
        .donation p { font-size: 0.9em; color: #ddd; margin-bottom: 15px; font-style: italic; }

        /* Sources Logos Section */
        .sources-section { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); }
        .sources-section h3 { font-size: 0.9em; color: #bbb; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; }
        .sources-logos { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
        .source-badge {
            background: rgba(255,255,255,0.08);
            padding: 10px 15px;
            border-radius: 10px;
            font-size: 0.8em;
            font-weight: 600;
            color: #fff;
            display: flex;
            align-items: center;
            border: 1px solid rgba(138, 43, 226, 0.3);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .source-badge .dot { width: 8px; height: 8px; background-color: #28a745; border-radius: 50%; margin-right: 8px; box-shadow: 0 0 5px #28a745; }
    </style>
</head>
<body>
    <div class="container">
        <img src="/subalchemy-logo.png" alt="SubAlchemy Logo" class="logo">
        <h1>SubAlchemy</h1>
        <p class="subtitle">Universal SRT Converter for Tizen 9 & Anime</p>
        <p class="description">For the best experience across all your devices, we recommend configuring this addon with the same API keys you use in <a href="https://stremio-addons.net/addons/subsense" target="_blank">SubSense</a>.</p>
        
        <div class="form-group">
            <label>SubDL API Key 
                <span class="tooltip">?<span class="tooltiptext">Great alternative source for movies and series.</span></span>
            </label>
            <div class="input-wrapper">
                <input type="text" id="subdlApiKey" placeholder="Enter your API Key">
                <button class="test-btn" onclick="testAPI('subdl')">Test</button>
            </div>
            <a href="https://subdl.com/panel/api" target="_blank" class="link">Get SubDL API Key</a>
        </div>

        <div class="form-group">
            <label>SubSource API Key 
                <span class="tooltip">?<span class="tooltiptext">Community-driven subtitle source.</span></span>
            </label>
            <div class="input-wrapper">
                <input type="text" id="subsourceApiKey" placeholder="Enter your API Key">
                <button class="test-btn" onclick="testAPI('subsource')">Test</button>
            </div>
            <a href="https://subsource.net/" target="_blank" class="link">Get SubSource API Key</a>
        </div>

        <div class="form-group">
            <label>Wyzie API Key (Optional) 
                <span class="tooltip">?<span class="tooltiptext">Free API, excellent for anime.</span></span>
            </label>
            <div class="input-wrapper">
                <input type="text" id="wyzieApiKey" placeholder="Enter your API Key">
                <button class="test-btn" onclick="testAPI('wyzie')">Test</button>
            </div>
            <a href="https://github.com/wyzie/Subs" target="_blank" class="link">Get Wyzie API Key</a>
        </div>

        <div class="form-group">
            <label>Preferred Languages (Max 3)</label>
            <div class="tags-container" id="selectedLangs"></div>
            <input type="text" id="langSearch" placeholder="Search languages..." oninput="filterLangs()">
            <div id="langList"></div>
        </div>

        <button class="install-btn" onclick="installAddon()">Install in Stremio</button>

        <div class="sources-section">
            <h3>Active Free Sources (No Config Required)</h3>
            <div class="sources-logos">
                <div class="source-badge"><span class="dot"></span>AnimeTosho</div>
            </div>
        </div>

        <div class="donation">
            <p>Did this magic solve your TV's subtitle problem? 🦡<br>If you can, buy me a coffee to keep the cauldron bubbling!</p>
            <a href='https://ko-fi.com/G4H521S5GK' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi5.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
        </div>
    </div>

    <script>
        const availableLangs = ['en', 'pt-br', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'ar', 'hi', 'ko'];
        const langNames = { 'en': 'English', 'pt-br': 'Portuguese (Brazil)', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian', 'ja': 'Japanese', 'zh': 'Chinese', 'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi', 'ko': 'Korean' };
        
        let selectedLangs = ['en'];

        function renderTags() {
            const container = document.getElementById('selectedLangs');
            container.innerHTML = '';
            selectedLangs.forEach(lang => {
                const tag = document.createElement('div');
                tag.className = 'tag';
                tag.innerHTML = langNames[lang] + ' <span class="remove" onclick="removeLang(\\''+lang+'\\')">&times;</span>';
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
                const res = await fetch('/test-api?type=' + type + '&key=' + key);
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
            } catch (e) { btn.innerText = 'Error!'; btn.className = 'test-btn invalid'; }
        }

        function installAddon() {
            const subdlKey = document.getElementById('subdlApiKey').value.trim();
            const subsourceKey = document.getElementById('subsourceApiKey').value.trim();
            const wyzieKey = document.getElementById('wyzieApiKey').value.trim();
            const langs = selectedLangs.join(',');
            
            const manifestUrl = '${baseUrl}/manifest.json?' + 
                                                   'subdlApiKey=' + encodeURIComponent(subdlKey) + 
                                                   '&subsourceApiKey=' + encodeURIComponent(subsourceKey) + 
                                                   '&wyzieApiKey=' + encodeURIComponent(wyzieKey) + 
                                                   '&languages=' + encodeURIComponent(langs);
            window.location.href = 'stremio://' + manifestUrl.replace('https://', '').replace('http://', '');
        }

        renderTags();
    </script>
</body>
</html>
`;
}
module.exports = { getConfigureHTML };