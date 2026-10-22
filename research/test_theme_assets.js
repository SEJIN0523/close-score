// Regression: standalone art must survive Chromium's CSS variable size limit.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const scoring = path.join(__dirname, '../scoring'), build = require('../scoring/theme-assets.js');
const template = fs.readFileSync(path.join(scoring, 'template.html'), 'utf8');
(async () => {
  for (const standalone of [false, true]) {
    const html = build(template, standalone);
    assert(!/__APPEARANCE__|__BLOSSOM_(?:ASSET|SCENES|PORTRAITS)__/.test(html));
    for (const css of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) assert(css[1].length < 2 ** 20, 'CSS exceeds browser custom-property limit');
    for (const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
    const expected = [['--character-image','blossom-sd.png'],['--character-scene','blossom-scenes.png'],['--character-portrait','blossom-portraits.png']];
    if (!standalone) { for (const [,file] of expected) assert(html.includes('url("themes/'+file+'")')); continue; }
    const assets=[], properties=[];
    const context = {
      document: { documentElement: { dataset: {}, style: { setProperty: (key, value) => { properties.push([key,value]); } } },
        querySelector: () => ({}), querySelectorAll: () => [], getElementById: () => null, addEventListener() {} },
      matchMedia: () => ({ matches: false, addEventListener() {} }),
      localStorage: { getItem: () => 'blossom' }, Uint8Array, Blob, atob,
      URL: { createObjectURL: blob => { assets.push(blob); return 'blob:local-character-'+assets.length; } },
    };
    new vm.Script(html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]).runInNewContext(context);
    assert.equal(assets.length,3);
    for(let i=0;i<expected.length;i++){const [property,file]=expected[i];assert.deepEqual(properties[i],[property,'url("blob:local-character-'+(i+1)+'")']);assert.equal(assets[i].type,'image/png');assert.deepEqual(Buffer.from(await assets[i].arrayBuffer()),fs.readFileSync(path.join(scoring,'web/themes',file)));}
  }
  console.log('Theme assets: web path, standalone image bytes, short CSS URL and script syntax passed.');
})();
