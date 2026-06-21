const availableLangs = ['en', 'pt-br', 'es', 'fr', 'de', 'it', 'ja', 'zh', 'ru', 'ar', 'hi', 'ko'];
const langNames = { 'en': 'English', 'pt-br': 'Portuguese (Brazil)', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian', 'ja': 'Japanese', 'zh': 'Chinese', 'ru': 'Russian', 'ar': 'Arabic', 'hi': 'Hindi', 'ko': 'Korean' };
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
    
    try {
        // Envia para o backend criptografar
        const res = await fetch('/api/config/encode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configObj)
        });
        const data = await res.json();
        
        if (data.encoded) {
            const baseUrl = window.location.origin;
            const manifestUrl = `${baseUrl}/${data.encoded}/manifest.json`;
            window.location.href = 'stremio://' + manifestUrl.replace('https://', '').replace('http://', '');
        } else {
            alert('Failed to generate configuration.');
        }
    } catch (e) {
        alert('Error installing: ' + e.message);
    }
}

// Initialize on load
renderTags();