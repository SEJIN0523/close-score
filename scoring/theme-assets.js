// Web uses cacheable local artwork; standalone HTML keeps all three forms embedded.
const fs = require('node:fs'), path = require('node:path');
const art = [
  ['BLOSSOM_ASSET', 'blossom-sd.png', '--character-image'],
  ['BLOSSOM_SCENES', 'blossom-scenes.png', '--character-scene'],
  ['BLOSSOM_PORTRAITS', 'blossom-portraits.png', '--character-portrait'],
];
module.exports = (html, standalone = false) => {
  let appearance = fs.readFileSync(path.join(__dirname, 'appearance.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'companion.js'), 'utf8');
  for (const [placeholder, file, property] of art) {
    if (standalone) {
      const encoded = fs.readFileSync(path.join(__dirname, 'web/themes', file)).toString('base64');
      // Short Blob URLs avoid Chromium's size limit for CSS custom properties.
      appearance += `\n(() => { const bytes = Uint8Array.from(atob('${encoded}'), c => c.charCodeAt(0));
const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
document.documentElement.style.setProperty('${property}', 'url("' + url + '")'); })();`;
    }
    html = html.replaceAll(`/*__${placeholder}__*/`, standalone ? 'data:,' : 'themes/' + file);
  }
  return html.replace('/*__APPEARANCE__*/', () => appearance);
};
