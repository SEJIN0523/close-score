// Run: node research/test_ocr.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const OCR = require('../scoring/ocr.js');
const stocks = Object.values(JSON.parse(fs.readFileSync(require('node:path').join(__dirname, '../scoring/data/last_px.json'))));
const names = ['원익IPS', '피에스케이홀딩스', '삼성전자', '가온전선', '대덕전자', 'KT&G', '신한지주', 'S-Oil', '하나금융지주', 'KB금융'];
const qty = [6, 3, 2, 2, 5, 3, 7, 4, 5, 4];
const prices = [101500, 174100, 220500, 249000, 135500, 194400, 91500, 141150, 121300, 160000];
const text = names.map((n, i) => `${i ? '' : '10.22 '}${n}\n${qty[i]}주 구매 완료\n주당 ${prices[i].toLocaleString('en-US')}원`).join('\n');
const rows = OCR.parse({ text }, stocks, '2026-10-22');
assert.equal(rows.length, 10);
assert.deepEqual(rows.map(r => r.qty), qty);
assert.deepEqual(rows.map(r => r.price), prices);
assert.ok(rows.every(r => r.code && r.side === 'buy' && r.date === '2026-10-22'));
assert.ok(OCR.issues(rows, [], stocks).every(i => !i.errors.length && !i.duplicate));
assert.equal(OCR.matchStock('s-oil', stocks), '010950');
assert.equal(OCR.matchStock('KT&G', stocks), '033780');
assert.equal(OCR.matchStock('원 익 I P S', stocks), '240810');
assert.equal(OCR.matchStock('삼성전자 005930', stocks), '005930');
assert.equal(OCR.matchStock('삼성', stocks), ''); // 추정한 종목으로 자동 등록하지 않는다.
const sell = OCR.parse({ text: '2025.12.31\nS-Oil\n4주 판매 완료\n주당 141,150원' }, stocks, '2026-10-22');
assert.equal(sell[0].side, 'sell'); assert.equal(sell[0].date, '2025-12-31');
const missing = OCR.parse({ text: '삼성전자\n주 구매 완료\n주당 220,500원' }, stocks, '2026-10-22');
assert.equal(missing.length, 1); assert.ok(OCR.issues(missing, [], stocks)[0].errors.length);
assert.equal(OCR.parse({ text: 'S-Oil\n4주 완료\n주당 141,150원' }, stocks, '2026-10-22')[0].side, '');
const box = (text, y, x = 100) => ({ text, bbox: { x0: x, y0: y, x1: x + 180, y1: y + 30 } });
const positioned = OCR.parse({ blocks: [{ paragraphs: [{ lines: [box('주당 101,500원', 55, 380), box('6주 구매 완료', 80), box('원익IPS', 35), box('3주 구매 완료', 280), box('주당 174,100원', 255, 380), box('피에스케이홀딩스', 235)] }] }] }, stocks, '2026-10-22');
assert.equal(positioned.length, 2); assert.equal(positioned[0].price, prices[0]); assert.equal(positioned[1].qty, 3);
assert.ok(OCR.issues([rows[0]], [rows[0]], stocks)[0].duplicate);
assert.ok(OCR.issues([rows[0], { ...rows[0] }], [], stocks)[1].duplicate);
assert.ok(!OCR.issues([{ ...rows[0], included: false }, rows[0]], [], stocks)[1].duplicate);
assert.ok(OCR.issues([{ ...rows[0], qty: -1, price: NaN, date: '2026-02-30' }], [], stocks)[0].errors.length >= 3);
assert.equal(OCR.validDate('2026-02-30'), false);
assert.equal(OCR.validDate('2024-02-29'), true);
const buy = { ...rows[0], id: 1 }, over = { ...buy, side: 'sell', qty: 7, id: 2 };
assert.ok(OCR.oversold([buy, over]));
assert.ok(OCR.oversold([buy, { ...over, qty: 1, date: '2026-10-21' }]));
assert.equal(OCR.oversold([buy, { ...over, qty: 6 }]), null);
console.log('OCR: sample 10 rows, Korean/English names, dates, directions, missing fields, coordinates, duplicates and chronological quantities passed.');
if (process.argv[2]) {
  const imageRows = OCR.parse(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), stocks, '2026-10-22');
  assert.equal(imageRows.length, 10);
  assert.ok(imageRows.every(r => r.side === 'buy'));
  const recognized = imageRows.filter(r => r.code).length;
  const invalid = OCR.issues(imageRows, [], stocks).filter(i => i.errors.length).length;
  console.log(`Actual attached image: ${imageRows.length} rows; ${recognized} exact stock matches; ${invalid} rows require correction before registration.`);
}
