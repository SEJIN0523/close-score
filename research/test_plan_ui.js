// Test the actual dashboard planning adapter, including manual/OCR fills outside the initial list.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const T = require('../scoring/trading.js'), template = fs.readFileSync(require.resolve('../scoring/template.html'), 'utf8');
const source = template.slice(template.indexOf('function snapRow('), template.indexOf('function todoCard('));
const row = { k: '005930', n: '삼성전자', s: '전자', p: 1000, rk: 1, ch: 0 }, date = '2026-10-23';
const calendar = JSON.parse(fs.readFileSync(require.resolve('../scoring/calendar.json'), 'utf8'));
const ctx = T.configure({ calendar }), writes = [];
const state = { TRADING: T, ROWS: [row], BY: { [row.k]: row }, META: { asOf: '2026-10-22', recs: [] }, tradingContext: ctx,
  CFG: { slots: 10, planBook: {} }, LOG: [{ id: 1, code: row.k, date, side: 'buy', price: 1000, qty: 3 }],
  LEDGER: [{ date: '2026-10-01', type: 'dep', amt: 300000 }], CSIGN: { dep: 1 }, CKEY: 'cfg', planSaveError: false,
  cashEffect: l => (l.side === 'buy' ? -1 : 1) * l.price * l.qty,
  SCORE: { plan: () => ({ stopPct: -.2, upPct: .4 }) }, won: String,
  store: { set: (key, value) => { writes.push(key); return true; } },
};
state.calcPos = logs => {
  const qty = logs.reduce((s, l) => s + (l.side === 'buy' ? l.qty : -l.qty), 0);
  return { POS: qty ? { [row.k]: { qty, avg: 1000, maxP: 1000, stopPct: -.2, upPct: .4, firstD: date, lastD: date, events: logs, completedStages: [] } } : {} };
};
const context = vm.createContext(state); vm.runInContext(source, context);
let result = context.buildTodo('cur', date);
assert.equal(result.items.length, 1);
assert.equal(result.items[0].qty, 10); // 3 already filled + 7 new, not a 7-share order with the first 3 counted twice.
assert.equal(result.items[0].progress.remaining, 7); assert.equal(result.items[0].available, 7);
assert.equal(state.LOG.length, 1); assert.ok(writes.every(key => key === 'cfg'));
state.LOG.push({ ...state.LOG[0], id: 2, qty: 2 }); result = context.buildTodo('cur', date);
assert.equal(result.items[0].qty, 10); assert.equal(result.items[0].progress.remaining, 5); assert.equal(result.items[0].available, 5);
state.LEDGER[0].amt = 5000; result = context.buildTodo('cur', date);
assert.equal(result.items[0].qty, 10); assert.equal(result.items[0].progress.remaining, 5); assert.equal(result.items[0].available, 0);
assert.equal(context.CFG.planBook[result.items[0].id].qty, 10);
console.log('Plan UI: post-fill plan reconstruction, fixed daily targets, actual fill totals, constrained availability and no trade/ledger writes passed.');
