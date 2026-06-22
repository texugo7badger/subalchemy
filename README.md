# SubAlchemy 🧙‍♂️

**Version 2.3.0** · [![Deploy on Render](https://img.shields.io/badge/Deploy-Render-46E3B7.svg)](https://render.com) · [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Stremio addon that acts as a **universal SRT converter and subtitle aggregator**. It fetches subtitles from 5 sources in parallel — **OpenSubtitles (keyless), AnimeTosho (scraping), SubDL, SubSource, and Wyzie** — and converts every modern format (VTT, ASS/SSA, ZIP) into the classic SRT format on-the-fly.

Designed specifically to solve the Samsung TV Tizen 9 subtitle problem: Tizen 9 strictly requires SRT and fails to load VTT or ASS files, leaving 90% of community subtitles unusable. SubAlchemy transmutes them all into SRT and serves them back to Stremio with perfect timing.

➡️ **[Click here to install SubAlchemy](https://subalchemy.onrender.com/configure)**

---

## 📺 The Problem

Samsung Tizen 9 (and several other TV/streaming sticks) does not support WebVTT (`.vtt`) or Advanced SubStation Alpha (`.ass`/`.ssa`) subtitles natively inside Stremio. Most community subtitle uploads for animes, movies and series are in one of those formats — so when the user clicks "subtitles" on the TV, they get nothing.

On top of that, cloud-hosted addons (like a free Render instance) often get blocked (`403 Forbidden`) by OpenSubtitles because their IPs are flagged as datacenters. And users want subtitles in their own language — not always English, not always Portuguese.

## ✨ The Solution

SubAlchemy intercepts every `/subtitles` request Stremio makes. For each request it:

1. **Resolves the title** — IMDB id via Cinemeta, or Kitsu id for anime.
2. **Queries all 5 providers in parallel** with per-provider deadline (10s default). Any provider that fails or times out is logged at `WARN` and skipped — the batch never aborts.
3. **Filters by the user's preferred languages** (up to 3, in priority order). Falls back to English if none match.
4. **Downloads the chosen subtitle** (ASS / VTT / ZIP / SRT), detects the source encoding (Shift-JIS, Big5, Windows-1252, etc.) and normalizes to UTF-8.
5. **Converts to SRT** using `ass-compiler` (for ASS) or a regex pipeline (for VTT). For ZIPs, extracts the inner `.srt`/`.ass`/`.ssa`/`.vtt` and converts if needed.
6. **Cleans promotional text** ("opensubtitles", "subscene", "support us", etc.) so the user only sees clean subs.
7. **Serves the final SRT** from its own HTTPS endpoint `https://subalchemy.onrender.com/srt/<id>.srt` with `Content-Type: application/x-subrip; charset=utf-8`.

To definitively bypass cloud IP blocks, the addon runs inside a **Docker container with Cloudflare WARP**, routing all OpenSubtitles traffic through a local SOCKS5 proxy at `127.0.0.1:40000`. The legacy `rest.opensubtitles.org` REST API is used (no user API key needed); if it returns `401`, the provider attempts a one-shot token refresh via the new `api.opensubtitles.com/api/v1/login` endpoint using `OS_API_KEY`.

---

## 🚀 Installation for Users

➡️ **[Click here to install SubAlchemy](https://subalchemy.onrender.com/configure)**

### Configuration Page

When you open the install link you'll see a sleek configuration page at `/configure`. The addon works out-of-the-box with **OpenSubtitles** and **AnimeTosho** (no keys required!). For a wider catalog you can optionally plug in 3 free API keys:

| Provider | Mechanism | Auth | Where to get a key |
|---|---|---|---|
| **OpenSubtitles** | REST `rest.opensubtitles.org` via WARP | Keyless (`X-User-Agent: VLSub 0.10.3`) | — (no key needed) |
| **AnimeTosho** | HTML scraping `animetosho.xyz` (cheerio) | None (browser UA) | — (no key needed) |
| **SubDL** | REST `api.subdl.com/api/v1/subtitles` | `api_key` query param | [subdl.com/panel/api](https://subdl.com/panel/api) |
| **SubSource** | REST `api.subsource.net/api/v1` | `X-API-Key` header | [subsource.net](https://subsource.net/) → My Profile |
| **Wyzie** | REST `sub.wyzie.io/api/v1/subs` | `x-api-key` header | [store.wyzie.io/redeem](https://store.wyzie.io/redeem) |

Each key has a **Test** button that probes the live API and shows `Valid!` (green) or the error message (red, e.g. `Error 401: ...`).

### Languages

Pick up to **3 preferred languages** in priority order (drag-free, click-to-add). The addon supports 12 languages out of the box:

- 🇧🇷 Portuguese (Brazil) · 🇬🇧 English · 🇪🇸 Spanish · 🇫🇷 French
- 🇩🇪 German · 🇮🇹 Italian · 🇯🇵 Japanese · 🇨🇳 Chinese (Simplified + Traditional)
- 🇷🇺 Russian · 🇸🇦 Arabic · 🇮🇳 Hindi · 🇰🇷 Korean

Fan-sub variants like `Brazilian_CR` (Erai-raws) and `POR-BR` (Ironclad) are auto-recognized.

### Install

Click **Install in Stremio** — your config (API keys + languages) is encoded into the install URL. Stremio opens, the addon is registered, and subtitles start appearing with the label `SubAlchemy [Portuguese (Brazil)]` (or `(Fallback)` if it had to fall back to English).

---

## 🧭 How It Works (User Flow)

```
Stremio (Tizen 9) ──GET /subtitles/movie/tt0111161.json──▶  SubAlchemy (Render)
                                                                  │
                                                                  ▼
                                            ┌─────────────────────────────────────┐
                                            │ 1. Resolve title via Cinemeta API   │
                                            │ 2. Query 5 providers in parallel    │
                                            │    • OpenSubtitles (WARP, keyless)  │
                                            │    • AnimeTosho  (scraping)         │
                                            │    • SubDL       (user api_key)     │
                                            │    • SubSource   (user X-API-Key)   │
                                            │    • Wyzie       (user x-api-key)   │
                                            │ 3. Pick best sub by user priority   │
                                            │ 4. Download → detect encoding →     │
                                            │    convert ASS/VTT/ZIP → SRT        │
                                            │ 5. Clean ads, store in memory       │
                                            └─────────────────────────────────────┘
                                                                  │
Stremio (Tizen 9) ◀──HTTPS SRT── https://subalchemy.onrender.com/srt/<id>.srt
```

---

## 🌟 Features

### Subtitle Aggregation
- **5 providers in parallel** with `Promise.all` + per-provider deadline race
- Per-provider DEBUG log: `[animetosho] Completed in 1200ms, returned 24 results.`
- Deduplication by `(source, language, format, releaseName)` — no double subs
- Any single provider failure logs WARN and returns empty — **never aborts the batch**

### Format Conversion (in-memory, no disk I/O)
- 🔄 **VTT → SRT** — regex pipeline that strips `WEBVTT` header, fixes timestamps (`.` → `,`), and removes cue indices
- 🔄 **ASS / SSA → SRT** — `ass-compiler` parses dialogues/slices/fragments, `subsrt-ts` builds the SRT body
- 📦 **ZIP → SRT** — `adm-zip` extracts the inner file (`.srt` first, then `.ass`/`.ssa` with on-the-fly conversion, then `.vtt`)
- 🧠 **Smart encoding detection** — `chardet` + BOM sniffing + iconv-lite for Shift-JIS / Big5 / GBK / EUC-KR / KOI8-R / Windows-1250/1252
- 🧹 **Ad removal** — strips leftover ASS style tags and promotional lines (`opensubtitles`, `subscene`, `subsource`, `wyzie`, `animetosho`, `support us`, `buy me a coffee`)

### Language Support
- **12 languages** with display names (Portuguese (Brazil), English, Spanish, French, German, Italian, Japanese, Chinese Simplified, Chinese Traditional, Russian, Arabic, Hindi, Korean)
- **Fan-sub variant recognition** — `Brazilian_CR`, `POR-BR`, `Portuguese[BR] [por, ASS]` all normalize to `por`
- **Priority fallback** — user picks up to 3 languages in priority order; if none match, falls back to English and tags the sub as `(Fallback)`

### Infrastructure
- 🛡️ **Cloudflare WARP** — Docker container with `warp-cli` routing OpenSubtitles through `socks5://127.0.0.1:40000` to bypass cloud IP blocks
- 🔒 **Encrypted configuration** — API keys are password fields in the UI; the install URL encodes them with AES-256-GCM (if `ENCRYPTION_KEY` is set) or base64-JSON fallback
- 🆓 **Keyless OpenSubtitles** — uses the public `VLSub 0.10.3` X-User-Agent header; falls back to v2 API + token refresh on `401`
- 🌸 **Anime support** — Kitsu API integration resolves anime titles by `kitsu:ID` so AnimeTosho can scrape them by name
- ⚡ **Inflight cache** — concurrent identical requests deduplicate via `InflightCache` so we don't hit providers twice for the same Stremio id

### UI
- ⚙️ **Component-based config page** — `head`, `header`, `apiKeyField`, `languageSelector`, `installButton`, `freeSources`, `footer`
- 🧪 **Per-key Test buttons** — SubDL, SubSource, and Wyzie keys are validated against the live API before install
- 🏷️ **Free sources badge** — `OpenSubtitles (Keyless)` + `AnimeTosho (Anime Subs)` highlighted as no-config-needed
- 💜 **Ko-fi overlay widget** — floating "Support me" button + traditional Ko-fi banner in the footer

---

## 💻 For Developers & Self-Hosting

This project features a fully modular architecture, open-source under the MIT license. You are welcome to clone, modify, and deploy your own instance.

### Repository Structure

```
subalchemy/
├── addon.js                    # Express server entrypoint (boot, route registration)
├── manifest.js                 # Stremio addon manifest
├── Dockerfile                  # node:20-slim + Cloudflare WARP
├── entrypoint.sh               # Starts dbus + warp-svc + warp-cli + node
├── package.json                # v2.3.0
├── README.md
└── src/
    ├── config.js               # parseConfigParam (URL-decoded JSON / base64 JSON)
    ├── constants.js            # OS_BASE, OS_UA, THROTTLE_MS, regexes
    ├── languages.js            # Re-export of utils/subtitleUtils (single source of truth)
    ├── logger.js               # Timestamped leveled logger
    ├── utils.js                # parseStremioId, isStremioClient, sleep
    ├── handlers/
    │   ├── subtitles.js        # ⭐ Universal priority-fallback flow
    │   └── stream.js           # (Legacy anime stream handler — currently disabled)
    ├── providers/
    │   ├── BaseProvider.js     # SubtitleResult class (interface contract)
    │   ├── ProviderManager.js  # ⭐ Orchestrator: parallel search + dedupe
    │   ├── index.js            # registerDefaultProviders() — 5 providers
    │   ├── OpenSubtitlesProvider.js   # REST .org via WARP, 401 → v2 token refresh
    │   ├── AnimeToshoProvider.js      # Scraping with &disp=attachments + cheerio
    │   ├── SubDLProvider.js            # api.subdl.com (user api_key)
    │   ├── SubsourceProvider.js        # api.subsource.net v1 (user X-API-Key)
    │   └── WyzieProvider.js            # sub.wyzie.io (user x-api-key)
    ├── converters/
    │   ├── index.js            # ⭐ convertToSrt(sub) — orchestrator
    │   ├── assToSrt.js         # ass-compiler + subsrt-ts
    │   ├── vttToSrt.js         # Regex pipeline
    │   ├── zipExtract.js       # ⭐ .srt / .ass / .ssa / .vtt inside ZIP
    │   ├── encoding.js         # chardet + iconv-lite
    │   └── removeAds.js        # Promotional text stripper
    ├── cache/
    │   ├── InflightCache.js    # Dedup concurrent identical provider queries
    │   └── SubtitleStore.js    # In-memory map for converted SRT payloads
    ├── routes/
    │   ├── index.js            # Aggregator
    │   ├── stremio.js          # /manifest.json + /:config/subtitles/...
    │   ├── configure.js        # /configure (HTML page)
    │   ├── configApi.js        # /api/config/encode + /api/test-api
    │   ├── proxy.js            # ⭐ /srt/:subId.srt — serves converted SRT
    │   └── health.js           # /health (Render uptime check)
    ├── meta/
    │   ├── cinemeta.js         # v3-cinemeta.strem.io for IMDB → title
    │   └── kitsu.js            # kitsu.io API for anime ID → title
    └── ui/
        ├── configurePage.js    # HTML composition
        ├── components/
        │   ├── head.js         # <head> with logo + styles
        │   ├── header.js       # Logo + SubSense recommendation
        │   ├── apiKeyField.js  # Password input + Test button + Get Key link
        │   ├── languageSelector.js  # Max-3 multiselect
        │   ├── installButton.js
        │   ├── freeSources.js  # Keyless provider badges
        │   ├── index.js        # Barrel
        │   └── footer.js       # ⭐ Ko-fi banner + floating overlay widget
        └── assets/
            ├── app.js          # Language picker + Test API + Install logic
            ├── styles.css
            └── subalchemy-logo.png
```

### Local Development (Without Docker)

> ⚠️ Without Docker, the OpenSubtitles provider may receive `403` from cloud-flagged IPs (your home ISP is usually fine). All other providers work normally.

1. Clone the repository.
2. `npm install`
3. Create a `.env` file (optional):
   ```env
   PORT=7000
   LOG_LEVEL=info
   # Optional: enable OpenSubtitles v2 fallback
   OS_API_KEY=
   # Optional: default API keys pre-filled in the UI
   SUBDL_API_KEY=
   SUBSOURCE_API_KEY=
   WYZIE_API_KEY=
   # Optional: AES-256-GCM encryption for user config in install URL
   ENCRYPTION_KEY=
   ```
4. `npm start`
5. Visit `http://localhost:7000/configure`
6. Add `http://localhost:7000/manifest.json` to Stremio.

### Deploy to Render (Free Tier with Docker)

This addon is optimized for free-tier deployment on Render.com using Docker to enable the Cloudflare WARP proxy.

1. Push this repository to your GitHub.
2. Go to [Render.com](https://render.com/) and create a new **Web Service**.
3. Connect your GitHub repository.
4. **Crucial:** In the "Runtime" setting, select **Docker** (not Node). Render will automatically detect the `Dockerfile`.
5. *(Optional but recommended)* Add an Environment Variable named `ENCRYPTION_KEY` with a 64-character hex string:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   This secures user API keys with AES-256-GCM in the install URL.
6. *(Optional)* Add `OS_API_KEY` for OpenSubtitles v2 fallback (get one at [opensubtitles.com/api](https://www.opensubtitles.com/api)).
7. Deploy and get your public HTTPS URL (`https://<your-service>.onrender.com`).
8. Share `https://<your-service>.onrender.com/configure` with your users.

---

## 🛠 Tech Stack

- **Runtime:** Node.js 20 (Docker `node:20-slim`)
- **Web server:** Express 4
- **Stremio SDK:** `stremio-addon-sdk` 1.6
- **HTTP client:** Axios 1.18
- **Proxy:** `socks-proxy-agent` 8 + Cloudflare WARP daemon
- **HTML parsing:** Cheerio 1.2 (AnimeTosho scraping)
- **ASS parsing:** `ass-compiler` 0.1 + `subsrt-ts` 2.1
- **ZIP extraction:** `adm-zip` 0.5
- **Encoding detection:** `chardet` 2.1 + `iconv-lite` 0.7
- **Config encoding:** `crypto` (AES-256-GCM) or base64-JSON fallback

---

## 🤝 Recommended Setup: SubAlchemy + SubSense

For the best experience across all your devices, use **SubSense** alongside **SubAlchemy**:

- **SubSense** — great for PC and Mobile. It provides fast access to modern formats (VTT/ASS) without conversion overhead.
- **SubAlchemy** — essential for Samsung TVs and TV sticks. It fetches the same sources but transmutes them into SRT.

When watching on your TV, simply select the subtitle provided by SubAlchemy, and it will work flawlessly!

---

## 📋 Changelog

### v2.3.0 (current)
- 🐛 **CRITICAL FIX:** Register `routes.proxy` in `addon.js` — the `/srt/:subId.srt` endpoint was missing, so converted SRT subtitles returned `404` on Tizen 9.
- 🐛 **FIX:** `zipExtract.js` now extracts `.ass`/`.ssa`/`.vtt` from inside ZIPs (previously only `.srt`), with on-the-fly ASS→SRT conversion. SubSource ZIPs with ASS tracks now play correctly.
- ✨ **NEW:** Ko-fi floating overlay widget on `/configure` (purple "Support me" button).
- 📚 **NEW:** Complete README rewrite with architecture, flow diagram, and full file-tree.

### v2.2.0
- ✨ Universal language priority fallback — user picks up to 3 languages in priority order; falls back to English if none match.
- 🐛 **FIX:** `generatePlaceholder` was imported by `languages.js` but didn't exist in `subtitleUtils.js` — would crash if called.
- 🔄 `languages.js` now re-exports from `utils/subtitleUtils.js` (single source of truth).
- 🌍 `subtitleUtils.js` now supports all 12 selector languages + fan-sub variants (`Brazilian_CR`, `POR-BR`, etc.).

### v2.1.0 — v2.1.1
- ✨ **NEW:** `SubsourceProvider` using `api.subsource.net/api/v1` (user-supplied `X-API-Key`).
- ✨ Per-provider DEBUG logs with elapsed ms and result count.
- 🐛 AnimeTosho: `&disp=attachments` param (was returning 0 subtitles), precise `a[href*="/subs/file/"]` selector, paginates up to 2 pages.
- 🐛 Wyzie: send `x-api-key` header from user config; WARN-skip when missing.
- 🐛 OpenSubtitles: detect HTTP 401, attempt token refresh via `OS_API_KEY`, fall back to v2 API.
- 🐛 SubDL: detect subtitle format from `release_name` extension (was hardcoded `zip`).
- 🐛 Orchestrator: dedupe by `(source|language|format|releaseName)` instead of URL-only.
- 🧪 `/api/test-api` now validates SubSource and Wyzie keys against the live API.
- 🔗 Wyzie "Get API Key" link updated to [store.wyzie.io/redeem](https://store.wyzie.io/redeem).

### v2.0.0
- Initial modular architecture: providers, converters, handlers, routes, UI components.
- OpenSubtitles via WARP SOCKS5 proxy to bypass cloud IP blocks.
- Encrypted config (AES-256-GCM) in install URL.
- Kitsu API integration for anime.

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details. Feel free to contribute, open issues, or submit pull requests!

---

<div align="center">
  <sub><i>Did this magic solve your TV's subtitle problem? 🦡<br>If you can, buy me a coffee to keep the cauldron bubbling!</i></sub>
  <br><br>
  <a href="https://ko-fi.com/G4H521S5GK">
    <img src="https://storage.ko-fi.com/cdn/kofi5.png?v=6" height="36" alt="Buy Me a Coffee at ko-fi.com" />
  </a>
</div>

<script src='https://storage.ko-fi.com/cdn/scripts/overlay-widget.js'></script>
<script>
  kofiWidgetOverlay.draw('texugo7badger', {
    'type': 'floating-chat',
    'floating-chat.donateButton.text': 'Support me',
    'floating-chat.donateButton.background-color': '#794bc4',
    'floating-chat.donateButton.text-color': '#fff'
  });
</script>
```

---

