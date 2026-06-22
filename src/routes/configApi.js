const express = require('express');
const axios = require('axios');
const { encryptConfig } = require('../config');
const router = express.Router();

// Rota para criptografar a config antes de enviar para o Stremio
router.post('/api/config/encode', (req, res) => {
  const config = req.body || {};
  try {
    const encoded = encryptConfig(config);
    res.json({ encoded });
  } catch (err) {
    res.status(500).json({ error: 'Encryption failed' });
  }
});

router.get('/api/test-api', async (req, res) => {
  const { type, key } = req.query;
  if (!key) return res.status(400).json({ valid: false });
  
  try {
    if (type === 'subdl') {
      await axios.get('https://api.subdl.com/api/v1/subtitles?imdb_id=tt0111161', { params: { api_key: key.trim() } });
    } else if (type === 'subsource') {
      // Probe the SubSource v1 API with a known movie search (The Matrix, tt0133093).
      // A valid key returns 200 with success=true; an invalid key returns 401.
      const probe = await axios.get('https://api.subsource.net/api/v1/movies/search', {
        params: { searchType: 'imdb', imdb: 'tt0133093' },
        headers: {
          'X-API-Key': key.trim(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
          'Accept': 'application/json',
        },
        timeout: 8000,
        validateStatus: status => status < 500,
      });
      if (probe.status !== 200 || probe.data?.success !== true) {
        return res.json({
          valid: false,
          error: `Error ${probe.status}: ${probe.data?.message || 'Invalid API key'}`,
        });
      }
    } else if (type === 'wyzie') {
      // Probe the Wyzie API with a known IMDB id (The Matrix, tt0133093).
      // Wyzie auths via `?key=` query param (NOT a header — the server
      // ignores x-api-key and Authorization). 200 with an array = valid key.
      // 401 = no key seen, 403 = invalid key, 429 = rate limit exceeded.
      const probe = await axios.get('https://sub.wyzie.io/search', {
        params: { id: 'tt0133093', key: key.trim() },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
          'Accept': 'application/json',
        },
        timeout: 8000,
        validateStatus: status => status < 500,
      });
      if (probe.status === 401) {
        return res.json({ valid: false, error: 'Error 401: API key not recognised' });
      }
      if (probe.status === 403) {
        return res.json({ valid: false, error: 'Error 403: Invalid or expired API key' });
      }
      if (probe.status === 429) {
        return res.json({ valid: false, error: 'Error 429: Daily rate limit exceeded (1000 req/day UTC on free tier)' });
      }
      if (probe.status !== 200) {
        return res.json({ valid: false, error: `Error ${probe.status}: ${probe.data?.message || 'Unknown error'}` });
      }
    }
    res.json({ valid: true });
  } catch (e) {
    res.json({ valid: false, error: `Error ${e.response?.status || ''}: ${e.response?.data?.message || e.message}` });
  }
});

module.exports = router;