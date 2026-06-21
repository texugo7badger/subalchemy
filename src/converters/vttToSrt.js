function convertVttToSrt(vttContent) {
  try {
    return vttContent
      .replace(/^WEBVTT.*\n/, '')
      .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3}) --> (\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2 --> $3,$4')
      .replace(/(\d{2}:\d{2})\.(\d{3}) --> (\d{2}:\d{2})\.(\d{3})/g, '00:$1,$2 --> 00:$3,$4')
      .split('\n')
      .filter((line, index, arr) => !(line.match(/^\d+$/) && arr[index + 1] && arr[index + 1].includes('-->')))
      .join('\n');
  } catch (e) {
    console.error('[vttToSrt] Conversion failed:', e.message);
    return null;
  }
}

module.exports = { convertVttToSrt };