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
    }
    res.json({ valid: true });
  } catch (e) {
    res.json({ valid: false, error: `Error ${e.response?.status || ''}: ${e.response?.data?.message || e.message}` });
  }
});

module.exports = router;