const express = require('express');
const subtitleStore = require('../cache/SubtitleStore');
const router = express.Router();

router.get('/srt/:subId', (req, res) => {
  const subId = req.params.subId.replace('.srt', '');
  const cachedSub = subtitleStore.get(subId);
  
  if (cachedSub) {
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(cachedSub.content);
  } else {
    res.status(404).send('Subtitle not found or expired.');
  }
});

module.exports = router;