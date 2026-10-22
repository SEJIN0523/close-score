// Regression: standalone art must survive Chromium's CSS variable size limit.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const scoring = path.join(__dirname, '../scoring'), build = require('../scoring/theme-assets.js');
const template = fs.readFileSync(path.join(scoring, 'template.html'), 'utf8');
(async () => {
  for (const standalone of [false, true]) {
    const html = build(template, standalone);
    assert(!/__APPEARANCE__|__BLOSSOM_ASSET__/.test(html));
    for (const css of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) assert(css[1].length < 2 ** 20, 'CSS exceeds browser custom-property limit');
    for (const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
    if (!standalone) { assert(html.includes('url("themes/blossom.png")')); continue; }
    let asset, property;
    const context = {
      document: { documentElement: { dataset: {}, style: { setProperty: (key, value) => { property = [key, value]; } } },
        querySelector: () => ({}), querySelectorAll: () => [], getElementById: () => null, addEventListener() {} },
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      localStorage: { getItem: () => 'blossom' }, Uint8Array, Blob, atob,
      URL: { createObjectURL: blob => { asset = blob; return 'blob:local-character'; } },
    };
    new vm.Script(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]).runInNewContext(context);
    assert.deepEqual(property, ['--character-image', 'url("blob:local-character")']);
    assert.equal(asset.type, 'image/png');
    assert.deepEqual(Buffer.from(await asset.arrayBuffer()), fs.readFileSync(path.join(scoring, 'web/themes/blossom.png')));
  }
  console.log('Theme assets: web path, standalone image bytes, short CSS URL and script syntax passed.');
})();
