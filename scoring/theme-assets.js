// Web uses a cacheable local asset; the standalone HTML remains self-contained.
const fs = require('node:fs'), path = require('node:path');
module.exports = (html, standalone = false) => {
  let appearance = fs.readFileSync(path.join(__dirname, 'appearance.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'companion.js'), 'utf8');
  if (standalone) {
    const encoded = fs.readFileSync(path.join(__dirname, 'web/themes/blossom-sd.png')).toString('base64');
    // Large data URLs exceed Chromium's CSS custom-property size limit. Keep the
    // bytes in JavaScript and give CSS a short document-local Blob URL instead.
    appearance += `\n(() => { const bytes = Uint8Array.from(atob('${encoded}'), c => c.charCodeAt(0));
const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
document.documentElement.style.setProperty('--character-image', 'url("' + url + '")'); })();`;
  }
  return html.replace('/*__APPEARANCE__*/', () => appearance)
    .replaceAll('/*__BLOSSOM_ASSET__*/', standalone ? 'data:,' : 'themes/blossom-sd.png');
};
