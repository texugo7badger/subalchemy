const express = require('express');
const { getConfigureHTML } = require('../ui/configurePage');
const router = express.Router();

router.get(['/', '/configure'], (req, res) => {
  res.set('Content-Type', 'text/html');
  res.send(getConfigureHTML());
});

module.exports = router;