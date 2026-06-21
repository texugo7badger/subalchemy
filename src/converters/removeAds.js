function removeAds(srtContent) {
  return srtContent
    .replace(/^(?:\{\\\w+\})+.*?(?:\{\\\w+\})+$/gm, '') // Remove ASS style tags leftovers
    .replace(/^(?:\d+\n)?[\d:,\->\s]+\n(.*?)(?:\n|$)/gm, (match, text) => {
      // Filter common ad patterns
      if (/opensubtitles|subscene|subsource|wyzie|animetosho|support\s+us|buy\s+me\s+a\s+coffee/i.test(text)) {
        return '';
      }
      return match;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { removeAds };