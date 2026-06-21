# SubAlchemy 🧙‍♂️

**Version 1.1.1**

A Stremio addon that acts as a universal SRT converter and aggregator. It fetches subtitles from multiple cloud-friendly APIs and Web Archives, supports Anime via Kitsu API, and converts modern formats (VTT, ASS/SSA, ZIP) into the classic SRT format on-the-fly.

Designed specifically to solve compatibility issues with Samsung TVs running Tizen 9, which strictly require SRT subtitles and fail to load VTT or ASS files.

## 📺 The Problem
Samsung Tizen 9 does not support WebVTT (.vtt) or Advanced SubStation Alpha (.ass/.ssa) subtitles natively in Stremio. This means 90% of community-uploaded subtitles for animes, movies, and series fail to load on the TV, leaving the user with no subtitles.

## ✨ The Solution
SubAlchemy intercepts subtitle requests in Stremio. If a subtitle is in VTT, ASS, or ZIP format, it downloads it, extracts/converts it to SRT in memory, cleans any promotional text, and serves it back to Stremio via a secure HTTPS endpoint.

## 🚀 Installation for Users

You can install SubAlchemy directly to your Stremio (PC, Mobile, or Samsung TV) using the link below:

➡️ **[Click here to install SubAlchemy](https://subalchemy.onrender.com/configure)** 

### Configuration
When you open the installation link, you will see a configuration page. 
SubAlchemy works out-of-the-box with several free sources (like OpenArchive and AnimeTosho), but **for the best experience, we recommend configuring it with your own API keys**. This prevents rate limits and ensures maximum subtitle availability.

1. **SubDL**: Get your free API key at [subdl.com](https://subdl.com/panel/api).
2. **SubSource**: Get your free API key at [subsource.net](https://subsource.net/).
3. **Wyzie**: Get your free API key at [github.com/wyzie/Subs](https://github.com/wyzie/Subs).
4. **BetaSeries**: Get your free API key at [betaseries.com](https://www.betaseries.com/api/).
5. Select your preferred languages (Max 3).
6. Click **Install in Stremio**.

## 🤝 Recommended Setup: SubAlchemy + SubSense
For the best experience across all your devices, use **SubSense** alongside **SubAlchemy**:
* **SubSense**: Great for PC and Mobile. It provides fast access to modern formats (VTT/ASS).
* **SubAlchemy**: Essential for Samsung TVs and TV Sticks. It fetches the same sources but transmutes them into SRT.

When watching on your TV, simply select the subtitle provided by SubAlchemy, and it will work flawlessly!

## 🌟 Features
- 🔄 Converts WebVTT (.vtt) to SRT
- 🔄 Converts Advanced SubStation Alpha (.ass/.ssa) to SRT
- 📦 Extracts and converts subtitles from .zip files automatically
- 🧹 Cleans promotional text/ads from subtitles automatically
- 🌐 Multi-Source Aggregation (APIs and Web Archives)
- 🌸 **Anime Support**: Integrates with Kitsu API to fetch anime subtitles by title.
- 🌍 **Multi-Language**: Supports dozens of languages out of the box.
- 🧹 Deduplicates redundant subtitles
- ⚙️ Custom UI configuration page with API testing buttons.
- ☁️ Deploys 100% free on Render.com

## 💻 For Developers & Self-Hosting

This project is open-source under the MIT license. You are welcome to clone, modify, and deploy your own instance.

### Local Development
1. Clone the repository.
2. Run `npm install`.
3. Create a `.env` file in the root directory with your keys:
   ```env
   SUBDL_API_KEY=your_subdl_key
   SUBSOURCE_API_KEY=your_subsource_key
   WYZIE_API_KEY=your_wyzie_key
   BETASERIES_API_KEY=your_betaseries_key
   PORT=7000
   ```
4. Run `npm start`.
5. Visit `http://localhost:7000/configure` to view the configuration page.
6. Add `http://localhost:7000/manifest.json` to Stremio.

### Deploy to Render (Free Tier)
This addon is optimized for free-tier deployment on Render.com. 

1. Push this repository to your GitHub.
2. Go to [Render.com](https://render.com/) and create a new **Web Service**.
3. Connect your GitHub repository.
4. Set the Build Command to `npm install` and Start Command to `npm start`.
5. Add your Environment Variables (`SUBDL_API_KEY`, `SUBSOURCE_API_KEY`, etc.) in the Render dashboard to act as defaults for your instance.
6. Deploy and get your public HTTPS URL!

## 🛠 Tech Stack
- Node.js
- Express
- Stremio Addon SDK
- Axios
- Cheerio (for web archives)
- adm-zip
- ass-compiler

## 📜 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. Feel free to contribute, open issues, or submit pull requests!

<br>

<div align="center">
  <sub><i>Did this magic solve your TV's subtitle problem? 🦡<br>If you can, buy me a coffee to keep the cauldron bubbling!</i></sub>
  <br><br>
  <a href="https://ko-fi.com/G4H521S5GK">
    <img src="https://storage.ko-fi.com/cdn/kofi5.png?v=6" height="36" alt="Buy Me a Coffee at ko-fi.com" />
  </a>
</div>