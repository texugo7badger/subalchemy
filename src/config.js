function parseConfigParam(raw) {
  if (!raw) return { config: {} };
  
  let config = null;
  
  // 1) URL-decoded JSON (modern client-side encoded config)
  try {
    config = JSON.parse(decodeURIComponent(raw));
  } catch (_) { /* fall through */ }
  
  // 2) Legacy plain base64 JSON
  if (!config) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded && decoded[0] === '{') {
        config = JSON.parse(decoded);
      }
    } catch (_) { /* fall through */ }
  }

  if (!config || typeof config !== 'object') config = {};
  
  // Ensure languages is an array
  if (config.languages && typeof config.languages === 'string') {
    config.languages = config.languages.split(',');
  }
  
  return { config };
}

module.exports = { parseConfigParam };