const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey() {
  // Se tiver uma ENCRYPTION_KEY de 64 chars (32 bytes) no .env, usa criptografia forte
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) return null;
  return Buffer.from(key, 'hex');
}

function encryptConfig(config) {
  const key = getKey();
  if (!key) {
    // Fallback para Base64 se não houver key configurada
    return Buffer.from(JSON.stringify(config)).toString('base64');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  // Formato: iv:authTag:encryptedData
  return [iv.toString('hex'), authTag, encrypted].join(':');
}

function decryptConfig(encryptedString) {
  const key = getKey();
  
  // Tenta Base64 primeiro (compatibilidade reversa)
  if (!key) {
    try {
      const decoded = Buffer.from(encryptedString, 'base64').toString('utf8');
      if (decoded && decoded[0] === '{') return JSON.parse(decoded);
    } catch (_) {}
  }

  // Tenta AES-256-GCM
  if (key) {
    try {
      const parts = encryptedString.split(':');
      if (parts.length === 3) {
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedData = parts[2];
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
      }
    } catch (e) {
      console.error('[Config] Decryption failed:', e.message);
    }
  }
  return null;
}

function parseConfigParam(raw) {
  if (!raw) return { config: {} };
  
  let config = decryptConfig(raw);
  
  if (!config) {
    // Tenta JSON URL-encoded diretamente (caso de fallback)
    try {
      config = JSON.parse(decodeURIComponent(raw));
    } catch (_) { /* fall through */ }
  }

  if (!config || typeof config !== 'object') config = {};
  
  // Ensure languages is an array
  if (config.languages && typeof config.languages === 'string') {
    config.languages = config.languages.split(',');
  }
  
  return { config };
}

module.exports = { parseConfigParam, encryptConfig, decryptConfig };