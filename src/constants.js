module.exports = {
  OS_BASE: 'https://rest.opensubtitles.org',
  OS_UA: 'VLSub 0.10.3',
  OS_DL_BASE: 'https://dl.opensubtitles.org',
  THROTTLE_MS: 250,
  PROVIDER_DEADLINE_MS: 8000,
  STREMIO_UA_RE: /stremio|com\.stremio|libmpv/i,
  OS_DIRECT_URL_RE: /^https?:\/\/dl\.opensubtitles\.org\//,
  OS_PROXIED_URL_RE: /\/api\/subtitle\/(?:vtt|srt|ass)\/(https?:\/\/dl\.opensubtitles\.org\/[^\s]+)/
};