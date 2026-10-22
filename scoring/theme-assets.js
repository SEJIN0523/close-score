// Web uses a cacheable local asset; the standalone HTML remains self-contained.
const fs = require('node:fs'), path = require('node:path');
module.exports = (html, standalone = false) => html
  .replace('/*__APPEARANCE__*/', () => fs.readFileSync(path.join(__dirname, 'appearance.js'), 'utf8'))
  .replaceAll('/*__BLOSSOM_ASSET__*/', standalone
    ? 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'web/themes/blossom.png')).toString('base64')
    : 'themes/blossom.png');
