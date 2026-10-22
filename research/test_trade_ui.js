// Exercise the real UI handlers without a browser or market-data requests.
// Run: node research/test_trade_ui.js
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const template = fs.readFileSync(path.join(__dirname, '../scoring/template.html'), 'utf8');
const source = template.slice(template.indexOf('const esc ='), template.indexOf('// 매매 기록 양식 채우기'));
const nodes = new Map(), events = {};
function node(id) {
  if (id.startsWith('ocr-row-')) return null;
  if (!nodes.has(id)) nodes.set(id, { checked: false, value: '', hidden: false, disabled: false, textContent: '', innerHTML: '', addEventListener() {}, close() {}, showModal() {} });
  return nodes.get(id);
}
const stock = { k: '005930', n: '삼성전자', p: 220500, rk: 2 };
let writes = [], storageOK = true, renders = 0;
const context = vm.createContext({
  console, Date, Number, String, Set, Promise, URL, setTimeout, clearTimeout,
  document: { getElementById: node, addEventListener: (name, fn) => { events[name] = fn; } },
  ROWS: [stock], BY: { [stock.k]: stock }, LOG: [], LKEY: 'close-score-log',
  store: { set: (key, value) => { if (!storageOK) return false; writes.push({ key, value }); return true; } },
  evalRow: () => ({ pl: { stopPct: -.15, upPct: .3 } }), SCORE: {},
  buildPos() {}, saveAll() {}, renderAll: () => { renders++; },
  TOSS_OCR: require('../scoring/ocr.js'), toast() {}, hsay() {}, won: n => n.toLocaleString('ko-KR'), kstToday: () => '2026-10-22',
});
vm.runInContext(source + '\nglobalThis.testUI={stage:r=>{ocrRows=r;},cancel:cancelOcr};', context);
const row = () => ({ code: stock.k, name: stock.n, date: '2026-10-22', side: 'buy', price: 220500, qty: 2, included: true });
const commit = () => { node('ocrReviewed').checked = true; node('ocrCommit').onclick(); };
context.testUI.stage([row()]);
assert.equal(context.LOG.length, 0); assert.equal(writes.length, 0); // Review does not persist.
context.testUI.cancel(); assert.equal(writes.length, 0); assert.equal(context.LOG.length, 0);
context.testUI.stage([row(), { ...row(), qty: 3, included: false }]);
node('ocrReviewed').checked = false; node('ocrCommit').onclick(); assert.equal(writes.length, 0);
commit(); assert.equal(context.LOG.length, 1); assert.equal(context.LOG[0].qty, 2);
assert.equal(context.LOG[0].stopPct, -.15); assert.equal(context.LOG[0].rk, 2);
assert.equal(writes.length, 1); assert.equal(writes[0].key, 'close-score-log');
const before = context.LOG;
context.testUI.stage([row()]); commit(); assert.equal(context.LOG, before); // Existing duplicate.
context.testUI.stage([{ ...row(), price: 0 }]); commit(); assert.equal(context.LOG, before);
context.testUI.stage([{ ...row(), side: 'sell', qty: 3 }]); commit(); assert.equal(context.LOG, before); // Oversell, no partial write.
context.testUI.stage([{ ...row(), date: '2026-10-21', side: 'sell', qty: 1 }]); commit(); assert.equal(context.LOG, before);
context.testUI.stage([{ ...row(), qty: 4 }, { ...row(), qty: 4 }]); commit(); assert.equal(context.LOG, before); // Within-batch duplicate.
context.testUI.stage([{ ...row(), qty: 4 }]); storageOK = false; commit(); assert.equal(context.LOG, before); // Storage failure.
storageOK = true;
context.testUI.stage([{ ...row(), qty: 4 }, { ...row(), qty: 5 }]); commit();
assert.equal(context.LOG.length, 3); assert.notEqual(context.LOG[1].id, context.LOG[2].id);
context.testUI.stage([{ ...row(), allowDuplicate: true }]); commit(); assert.equal(context.LOG.length, 4);
const message = { textContent: '' }, form = {
  dataset: { code: stock.k, side: 'buy', date: '2026-10-22' },
  elements: { price: { value: '221,000' }, qty: { value: '6' } },
  querySelector: () => message,
};
const submit = () => events.submit({ target: { closest: () => form }, preventDefault() {} });
submit(); assert.equal(context.LOG.at(-1).price, 221000); assert.equal(context.LOG.at(-1).qty, 6);
const length = context.LOG.length; submit(); assert.equal(context.LOG.length, length); assert.match(message.textContent, /이미 있습니다/);
form.elements.price.value = '0'; submit(); assert.equal(context.LOG.length, length);
assert.equal(writes.length, renders);
console.log('Trade UI: review/cancel isolation, explicit review, exclusion, duplicates/override, atomic batch persistence, storage failure, historical oversell and direct execution price passed.');
