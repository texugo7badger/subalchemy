const { compile } = require('ass-compiler');
const subsrt = require('subsrt-ts');

function convertAssToSrt(assContent) {
  try {
    const compiled = compile(assContent);
    const captions = compiled.dialogues.map((dialog, index) => {
      let text = '';
      if (dialog.slices) {
        for (const slice of dialog.slices) {
          for (const fragment of slice.fragments) {
            text += fragment.text || '';
          }
        }
      }
      text = text.replace(/\\N/g, '\n').trim();
      return {
        index: index + 1,
        start: Math.round(dialog.start * 1000),
        end: Math.round(dialog.end * 1000),
        text: text
      };
    }).filter(cap => cap.text.length > 0);

    return subsrt.build(captions, { format: 'srt' });
  } catch (e) {
    console.error('[assToSrt] Conversion failed:', e.message);
    return null;
  }
}

module.exports = { convertAssToSrt };