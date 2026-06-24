# SubAlchemy

**Version 2.4.4** · [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Stremio addon that acts as a **universal SRT converter and subtitle aggregator**. It fetches subtitles from 5 sources in parallel — **OpenSubtitles (keyless), AnimeTosho (scraping), SubDL, SubSource, and Wyzie** — and converts every modern format (VTT, ASS/SSA, ZIP, .xz, .gz) into the classic SRT format on-the-fly.

---

## The Problem

Samsung Tizen 9 (and several other TV/streaming sticks) **does not support WebVTT (`.vtt`) or Advanced SubStation Alpha (`.ass`/`.ssa`) subtitles** natively inside Stremio. Most community subtitle uploads for animes, movies and series are in one of those formats — so when the user clicks "subtitles" on the TV, they get nothing.

On top of that, cloud-hosted addons often get **`403 Forbidden`** from OpenSubtitles because their IPs are flagged as datacenters. SubAlchemy solves both issues by running inside a **Docker container with Cloudflare WARP** (routing OpenSubtitles traffic through a local SOCKS5 proxy at `127.0.0.1:40000`) and serving the final SRT with full CORS headers, `Content-Disposition`, and immutable cache — exactly what Samsung Tizen 9 needs to load the subtitle without "Failed to load external subtitle" errors.

Languages

Pick up to 3 preferred languages in priority order (drag-free, click-to-add). The addon supports 12 languages out of the box:

    🇧🇷 Portuguese (Brazil) · 🇬🇧 English · 🇪🇸 Spanish · 🇫🇷 French
    🇩🇪 German · 🇮🇹 Italian · 🇯🇵 Japanese · 🇨🇳 Chinese (Simplified + Traditional)
    🇷🇺 Russian · 🇸🇦 Arabic · 🇮🇳 Hindi · 🇰🇷 Korean

---

## Quick Start (Docker, local)

> For enthusiasts self-hosting on a Linux box with Docker. The Dockerfile and `.env.production.example` in this repo are the only files you need to commit; your real `.env.production` and `docker-compose.yml` stay on the host and are NOT committed.

### 1. Build the image

```bash
git clone https://github.com/texugo7badger/subalchemy.git
cd subalchemy
docker build -t subalchemy .
```

### 2. Prepare your `.env.production`

```bash
cp .env.production.example .env.production
# Edit at minimum:
#   PORT=10000
#   BASE_URL=http://localhost:10000   (or your HTTPS URL if behind a reverse proxy)
#   ENCRYPTION_KEY=  (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 3. Run the container

The container needs `/dev/net/tun` and `NET_ADMIN` + `SYS_ADMIN` capabilities for the Cloudflare WARP daemon to work.

```bash
docker run -d \
  --name subalchemy \
  --cap-add NET_ADMIN \
  --cap-add SYS_ADMIN \
  --device /dev/net/tun:/dev/net/tun \
  -p 10000:10000 \
  --env-file .env.production \
  subalchemy
```

If `/dev/net/tun` does not exist on your host:

```bash
sudo modprobe tun
echo "tun" | sudo tee /etc/modules-load.d/tun.conf   # persist across reboots
```

### 4. Open the configuration page

Visit **http://localhost:10000/configure**, pick up to 3 languages, optionally plug in API keys, and click **Install in Stremio**.

### 5. Verify the WARP proxy

```bash
# Inside the container — should print "Status update: Connected"
docker exec subalchemy warp-cli status

# IP via WARP (should differ from your host's public IP)
docker exec subalchemy curl -sS --socks5-hostname 127.0.0.1:40000 https://cloudflare.com/cdn-cgi/trace | grep ^ip=
```

---

## Local Development (without Docker)

> Without Docker, the OpenSubtitles provider may receive `403` from cloud-flagged IPs (your home ISP is usually fine). All other providers work normally. `lzma-native` requires a C/C++ toolchain (`build-essential` on Linux, Xcode CLI tools on macOS).

```bash
npm install
cp .env.production.example .env   # edit PORT/BASE_URL for dev
npm start
# Visit http://localhost:7000/configure
```

---

## Providers

| Provider | Mechanism | Auth | Key needed? |
|---|---|---|---|
| **OpenSubtitles** | REST `rest.opensubtitles.org` via WARP | Keyless (`X-User-Agent: VLSub 0.10.3`) | No |
| **AnimeTosho** | HTML scraping `animetosho.xyz` | None | No |
| **SubDL** | REST `api.subdl.com/api/v1/subtitles` | `api_key` query param | [subdl.com/panel/api](https://subdl.com/panel/api) |
| **SubSource** | REST `api.subsource.net/api/v1` | `X-API-Key` header | [subsource.net](https://subsource.net/) |
| **Wyzie** | REST `sub.wyzie.io/api/v1/subs` | `x-api-key` header | [store.wyzie.io/redeem](https://store.wyzie.io/redeem) |

Each key has a **Test** button on `/configure` that probes the live API and shows `Valid!` (green) or the error message (red, e.g. `Error 401: ...`).

---

## Environment Variables

See [`.env.production.example`](.env.production.example) for the full list with comments. The two **required** ones are:

| Variable | Example | Purpose |
|---|---|---|
| `PORT` | `10000` | Port Express listens to inside the container. |
| `BASE_URL` | `http://localhost:10000` | Public URL of the addon (used to build absolute `/srt/<id>.srt` URLs returned to Stremio). Use HTTPS in production. |

Everything else (`OS_API_KEY`, `SUBDL_API_KEY`, `SUBSOURCE_API_KEY`, `WYZIE_API_KEY`, `ENCRYPTION_KEY`, `LOG_LEVEL`, `PROVIDER_DEADLINE_MS`) is optional.

---

## Tech Stack

- **Runtime:** Node.js 20 (Docker `node:20-slim`)
- **Web server:** Express 4
- **HTTP client:** Axios 1.18 + `socks-proxy-agent` 8 (for WARP)
- **ASS parsing:** `ass-compiler` + `subsrt-ts`
- **ZIP / XZ / GZ:** `adm-zip` / `lzma-native` / Node `zlib`
- **Encoding detection:** `chardet` + `iconv-lite`
- **HTML scraping:** `cheerio` (AnimeTosho)

---

## License

MIT — see [LICENSE](LICENSE). Free to clone, modify, and self-host.

---

<div align="center">

### 💜 Support SubAlchemy

<sub><i>Did this magic solve your TV's subtitle problem? 🦡<br>If you can, buy me a coffee to keep the cauldron bubbling!</i></sub>

<br>

<a href="https://ko-fi.com/G4H521S5GK">
  <img src="https://storage.ko-fi.com/cdn/kofi5.png?v=6" height="50" alt="Buy Me a Coffee at ko-fi.com" />
</a>

&nbsp;&nbsp;&nbsp;&nbsp;

<a href="https://livepix.gg/texugo7badger">
  <img src="https://i.imgur.com/jjPuVUG.png" height="50" alt="Doe via LivePix (PIX)" />
</a>

<br><br>

<sub>Made with 🧪 by <a href="https://github.com/texugo7badger">@texugo7badger</a></sub>

</div>
