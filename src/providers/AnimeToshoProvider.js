const { BaseProvider, SubtitleResult } = require('./BaseProvider');
const { log } = require('../logger');
const { normalizeLanguage } = require('../utils/subtitleUtils');
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://animetosho.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

/**
 * AnimeTosho subtitle provider.
 * Scrapes animetosho.xyz search results for subtitle attachments.
 */
class AnimeToshoProvider extends BaseProvider {
  constructor() {
    super('animetosho', { enabled: true });
  }

  /**
   * Build the search URL with required disp=attachments parameter.
   * Without disp=attachments, the page shows episode rows instead of subtitle files.
   * @param {string} query - The search query (anime title)
   * @param {string} [group] - Optional fansub group filter
   * @param {number} [page=1] - Page number (capped at 2)
   * @returns {string} Full search URL
   */
  _buildSearchUrl(query, group, page = 1) {
    let url = `${BASE_URL}/search?q=${encodeURIComponent(query)}&disp=attachments`;
    if (group) {
      url += `&group=${encodeURIComponent(group)}`;
    }
    if (page > 1) {
      url += `&page=${page}`;
    }
    return url;
  }

  /**
   * Extract language from link text like "English [eng, ASS]" or "Portuguese[BR] [por, ASS]"
   * @param {string} text - The link text
   * @returns {string} ISO 639-2 language code (por, eng, spa, etc.)
   */
  _extractLanguage(text) {
    const patterns = [
      { regex: /portuguese|brazilian|POR-BR/i, code: 'por' },
      { regex: /english|ENG/i, code: 'eng' },
      { regex: /spanish|latin.american|spa-la/i, code: 'spa' },
      { regex: /french|fre/i, code: 'fra' },
      { regex: /german|ger/i, code: 'deu' },
      { regex: /italian|ita/i, code: 'ita' },
      { regex: /arabic|ara/i, code: 'ara' },
      { regex: /russian|rus/i, code: 'rus' },
      { regex: /japanese|jpn/i, code: 'jpn' },
      { regex: /korean|kor/i, code: 'kor' },
    ];
    for (const { regex, code } of patterns) {
      if (regex.test(text)) return code;
    }
    // Fallback: normalize the raw text
    const normalized = normalizeLanguage(text);
    return normalized || 'eng';
  }

  /**
   * Extract subtitle format from link text like "[eng, ASS]" or file extension
   * @param {string} text - The link text
   * @param {string} href - The href URL
   * @returns {string} Format: 'ass', 'srt', 'vtt', or 'zip'
   */
  _extractFormat(text, href) {
    const bracketMatch = text.match(/\[([a-z]+),\s*(ASS|SRT|VTT|SUB)\]/i);
    if (bracketMatch) return bracketMatch[2].toLowerCase();
    if (href.endsWith('.ass') || text.endsWith('.ass')) return 'ass';
    if (href.endsWith('.srt') || text.endsWith('.srt')) return 'srt';
    if (href.endsWith('.vtt') || text.endsWith('.vtt')) return 'vtt';
    if (href.endsWith('.zip') || text.endsWith('.zip')) return 'zip';
    return 'ass'; // Default for AnimeTosho (most subs are ASS)
  }

  /**
   * Extract release name from the page context near the attachment link.
   * @param {object} $ - Cheerio instance
   * @param {object} el - The current anchor element
   * @param {string} fallback - Fallback text from the link itself
   * @returns {string} Release name
   */
  _extractReleaseName($, el, fallback) {
    // Try closest .home_list_entry container
    const entry = $(el).closest('.home_list_entry');
    if (entry.length) {
      const titleLink = entry.find('.link a').first();
      if (titleLink.length && titleLink.text().trim()) {
        return titleLink.text().trim();
      }
    }
    // Try closest parent with a title/link
    const parentTitle = $(el).closest('div').find('.link, .title').first().text().trim();
    if (parentTitle) return parentTitle;
    return fallback || '';
  }

  /**
   * Scrape a single page of search results.
   * @param {string} url - The search URL
   * @param {object} $ - Cheerio instance (optional, for re-use)
   * @returns {SubtitleResult[]} Array of subtitle results
   */
  async _scrapePage(url) {
    log('debug', `[AnimeTosho] Fetching: ${url}`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const subs = [];

    // Select only attachment links pointing to /subs/file/ (precise selector)
    $('a[href*="/subs/file/"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !text) return;

      // Build full download URL: /download/616712/subs/file/61736 -> full URL
      let downloadUrl = href;
      if (downloadUrl.startsWith('/')) {
        downloadUrl = `${BASE_URL}${downloadUrl}`;
      }

      const language = this._extractLanguage(text);
      const format = this._extractFormat(text, href);
      const releaseName = this._extractReleaseName($, el, text);

      // Generate a unique ID from the URL
      const idMatch = href.match(/\/subs\/file\/(\d+)/);
      const fileId = idMatch ? idMatch[1] : `at-${i}`;

      subs.push(new SubtitleResult({
        id: `animetosho-${fileId}`,
        url: downloadUrl,
        language,
        source: 'animetosho',
        fileName: text.replace(/[<>:"/\\|?*]/g, '_') + '.' + format,
        format,
        needsConversion: format !== 'srt',
        releaseName,
      }));
    });

    return subs;
  }

  async search(query) {
    if (!query.searchQuery) return { subtitles: [] };

    const group = query.group || null;
    const allSubs = [];

    try {
      // Scrape up to 2 pages
      for (let page = 1; page <= 2; page++) {
        const url = this._buildSearchUrl(query.searchQuery, group, page);
        const pageSubs = await this._scrapePage(url);
        allSubs.push(...pageSubs);

        // If page 1 returned fewer than ~15 results, stop (no more pages)
        if (pageSubs.length < 10) break;
      }

      // Deduplicate by id
      const seen = new Set();
      const unique = allSubs.filter(s => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });

      log('info', `[AnimeTosho] Found ${unique.length} subtitles.`);
      return { subtitles: unique };
    } catch (err) {
      log('warn', `[AnimeTosho] Error: ${err.message}`);
      return { subtitles: [] };
    }
  }
}

module.exports = AnimeToshoProvider;