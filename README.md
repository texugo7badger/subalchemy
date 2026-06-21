# SubAlchemy 🧙‍♂️

**Version 1.0.0**

A Stremio addon that acts as a universal SRT converter. It fetches subtitles from multiple sources (OpenSubtitles, SubDL), supports Animes via Kitsu API, and converts modern formats (VTT, ASS/SSA) into the classic SRT format on-the-fly. 

Designed specifically to solve compatibility issues with Samsung TVs running Tizen 9, which strictly require SRT subtitles and fail to load VTT or ASS files.

## The Problem
Samsung Tizen 9 does not support WebVTT (.vtt) or Advanced SubStation Alpha (.ass/.ssa) subtitles natively in Stremio. This means 90% of community-uploaded subtitles for animes, movies, and series fail to load on the TV, leaving the user with no subtitles.

## The Solution
SubAlchemy intercepts subtitle requests in Stremio. If a subtitle is in VTT or ASS format, it downloads it, converts it to SRT in memory, and serves it back to Stremio via a secure HTTPS endpoint.

## 🤝 Recommended Setup: SubAlchemy + SubSense
For the best experience across all your devices, use **SubSense** alongside **SubAlchemy**:

1. **SubSense**: Great for PC and Mobile. It provides fast access to modern formats (VTT/ASS).
2. **SubAlchemy**: Essential for Samsung TVs and TV Sticks. It fetches the same sources but transmutes them into SRT.

When watching on your TV, simply select the subtitle provided by SubAlchemy, and it will work flawlessly!

## Features
- 🔄 Converts WebVTT (.vtt) to SRT
- 🔄 Converts Advanced SubStation Alpha (.ass/.ssa) to SRT
- 🌐 Fetches from multiple sources (OpenSubtitles, SubDL)
- 🌸 **Anime Support**: Integrates with Kitsu API to fetch anime subtitles by title.
- 🌍 **Multi-Language**: Supports dozens of languages out of the box.
- 🧹 Deduplicates redundant subtitles
- ⚙️ Custom UI configuration page with API testing buttons.
- ☁️ Deploys 100% free on Render.com

## Local Development
1. Clone the repository.
2. Run `npm install`.
3. Create a `.env` file in the root directory with your keys:
   ```env
   OPENSUBTITLES_API_KEY=your_opensubtitles_key
   SUBDL_API_KEY=your_subdl_key
   SUBSOURCE_API_KEY=your_subsource_key
   WYZIE_API_KEY=your_wyzie_key
   BASE_URL=yourip
   ```
4. Run `npm start`.
5. Visit `http://localhost:7000/configure` to view the configuration page.
6. Add `http://localhost:7000/manifest.json` to Stremio.

## Deploy (Free Tier)
This addon is optimized for free-tier deployment on Render.com. 

1. Push this repository to GitHub.
2. Go to [Render.com](https://render.com/) and create a new **Web Service**.
3. Connect your GitHub repository.
4. Set the Build Command to `npm install` and Start Command to `npm start`.
5. Add your Environment Variables (`OPENSUBTITLES_API_KEY`, `SUBDL_API_KEY`, `SUBSOURCE_API_KEY` and `WYZIE_API_KEY`) in the Render dashboard.
6. Deploy and get your public HTTPS URL!
7. Visit `https://your-render-url.onrender.com/configure` to set up your addon and install it.

## Tech Stack
- Node.js
- Stremio Addon SDK
- Axios
- ass-compiler