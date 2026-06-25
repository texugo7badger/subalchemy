const express = require('express');
const userConfigStore = require('../cache/UserConfigStore');
const { log } = require('../logger');
const router = express.Router();

/**
 * v2.4.5 (configure-restore): Restore a previously-saved user config so
 * the /configure page opens with API keys + languages pre-filled.
 *
 * Flow:
 *   1. User opens ${addonUrl}/configure in Stremio (no config param forwarded).
 *   2. Browser has cookie `subalchemy_uid` set on first visit (see configure.js).
 *   3. Page's app.js calls this endpoint with the cookie value.
 *   4. We look up the stored config and return it (or 404 if not found).
 *   5. Page pre-fills the form fields.
 *
 * Note: API keys are returned in plaintext here. This is acceptable
 * because the request is same-origin (browser → our own server), and the
 * manifest URL already exposes keys in base64 to anyone who has it.
 */
router.get('/api/config/restore', (req, res) => {
  const userId = req.cookies?.subalchemy_uid;
  if (!userId) {
    log('debug', '[configRestore] No subalchemy_uid cookie — returning 404.');
    return res.status(404).json({ found: false });
  }
  const config = userConfigStore.get(userId);
  if (!config) {
    log('debug', `[configRestore] userId=${userId.substring(0, 8)}… not in store — returning 404.`);
    return res.status(404).json({ found: false });
  }
  log('info', `[configRestore] Restoring config for userId=${userId.substring(0, 8)}… (langs=${config.languages || 'none'}).`);
  return res.json({ found: true, config });
});

/**
 * Persist the user's current config BEFORE redirecting to stremio://.
 *
 * The browser's app.js calls this endpoint with the config payload, then
 * on success triggers the stremio:// redirect. This way the config is
 * durably stored server-side under the user's cookie, so future /configure
 * visits (from Stremio's "Configure" button) can restore it.
 */
router.post('/api/config/save', (req, res) => {
  const userId = req.cookies?.subalchemy_uid;
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'no-cookie' });
  }
  const config = req.body || {};
  userConfigStore.set(userId, config);
  log('info', `[configSave] Saved config for userId=${userId.substring(0, 8)}… (langs=${config.languages || 'none'}).`);
  return res.json({ ok: true });
});

module.exports = router;
