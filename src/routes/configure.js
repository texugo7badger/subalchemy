const express = require('express');
const { getConfigureHTML } = require('../ui/configurePage');
const userConfigStore = require('../cache/UserConfigStore');
const { log } = require('../logger');
const router = express.Router();

const COOKIE_NAME = 'subalchemy_uid';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Serve /configure with a stable userId cookie so the page can restore
 * the user's previously-saved config.
 *
 * Three URL patterns are handled:
 *   1. `/`                  — bare root (initial install flow)
 *   2. `/configure`         — explicit /configure path
 *   3. `/:config/configure` — Stremio's "Configure" button on an INSTALLED
 *                             addon. Stremio takes the addon's installation
 *                             URL (which contains the base64 config) and
 *                             appends /configure. We IGNORE the :config
 *                             param here — the page reconstructs the user's
 *                             state via the subalchemy_uid cookie + the
 *                             /api/config/restore endpoint.
 *
 * Without #3, Stremio's "Configure" button on an installed addon returns
 * 404 "Not found" because no route matches `/:config/configure`.
 */
router.get(['/', '/configure', '/:config/configure', '/*/configure', '/*/*/configure'], (req, res) => {
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