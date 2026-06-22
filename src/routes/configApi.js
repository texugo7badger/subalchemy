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
      // A valid key returns 200 with an array (possibly empty); an invalid
      // key returns 401/403 and axios will throw — caught by the catch below.
      await axios.get('https://sub.wyzie.io/api/v1/subs', {
        params: { imdb: 'tt0133093' },
        headers: {
          'x-api-key': key.trim(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
          'Accept': 'application/json',
        },
        timeout: 8000,
      });
    }
    res.json({ valid: true });
  } catch (e) {
    res.json({ valid: false, error: `Error ${e.response?.status || ''}: ${e.response?.data?.message || e.message}` });
  }
});

module.exports = router;