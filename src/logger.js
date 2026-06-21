const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'];

function log(level, message) {
  if (LEVELS[level] <= currentLevel) {
    const timestamp = new Date().toISOString();
    console[level === 'debug' ? 'log' : level](`[${timestamp}] [SubAlchemy] [${level.toUpperCase()}] ${message}`);
  }
}

module.exports = { log };