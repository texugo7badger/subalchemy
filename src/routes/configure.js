const express = require('express');
const crypto = require('crypto');
const { getConfigureHTML } = require('../ui/configurePage');
const userConfigStore = require('../cache/UserConfigStore');
const { log } = require('../logger');
const router = express.Router();

const COOKIE_NAME = 'subalchemy_uid';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * v2.4.5 (configure-restore): serve /configure with a stable userId cookie
 * so the page can restore the user's previously-saved config.
 *
 * Stremio opens ${addonUrl}/configure (no params) when the user clicks
 * "Configure" on an installed addon. Without this fix, the page opens
 * with empty fields because the base64 config is only in the manifest URL.
 *
 * Flow:
 *   1. On first visit: no cookie → generate userId, set cookie, render page.
 *   2. On repeat visit: cookie present → render page. The page's app.js
 *      calls /api/config/restore with the cookie to fetch the saved
 *      config (if any) and pre-fill the form.
 *   3. When user clicks "Install in Stremio": app.js POSTs the config to
 *      /api/config/save so it's persisted under the userId, then triggers
 *      the stremio:// redirect.
 */
router.get(['/', '/configure'], (req, res) => {
  let userId = req.cookies?.[COOKIE_NAME];
  if (!userId) {
    userId = userConfigStore.generateUserId();
    log('info', `[Configure] New visitor — issuing userId=${userId.substring(0, 8)}…`);
    res.cookie(COOKIE_NAME, userId, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      // secure: true  // enable in production when BASE_URL is https
    });
  } else {
    log('debug', `[Configure] Returning visitor userId=${userId.substring(0, 8)}…`);
  }

  res.set('Content-Type', 'text/html');
  res.send(getConfigureHTML());
});

module.exports = router;
