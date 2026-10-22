const assert = require('node:assert/strict');
const { selectMarketSnapshot } = require('../scoring/market-snapshot.js');
const row = (d, k = '105560') => ({ d, k, p: 158200 });
const saved = { META: { asOf: '2026-10-22', final: true, builtAt: '2026-10-22T14:45:52Z' }, ROWS: [row('2026-10-22')] };
const original = JSON.stringify(saved);
for (const candidate of [null, { META: { asOf: '2026-10-21', final: true } }, { META: { asOf: '2026-10-22', final: false } },
  { META: { asOf: '2026-10-22', final: true }, ROWS: [row('2026-10-21'), row('2026-10-21', '086790')] },
  { META: { asOf: '2026-10-22', final: true }, ROWS: [row('2026-10-22'), row('2026-10-21', '086790')] },
  { META: { asOf: '2026-10-22', final: true }, ROWS: [row('2026-10-23')] }]) {
  const result = selectMarketSnapshot(candidate, saved, '2026-10-22');
  assert(result.reason); assert.equal(result.snapshot.META.asOf, '2026-10-22');
  assert.equal(result.snapshot.META.builtAt, saved.META.builtAt);
  assert.deepEqual(result.snapshot.ROWS, saved.ROWS); assert(result.snapshot.META.refreshWarning);
}
assert.equal(JSON.stringify(saved), original, 'fallback mutated the verified snapshot');
const next = { META: { asOf: '2026-10-23', final: false }, ROWS: [row('2026-10-23')] };
assert.equal(selectMarketSnapshot(next, saved, '2026-10-22').snapshot, next);
assert.equal(selectMarketSnapshot(saved, saved, '2026-10-22').snapshot, saved);
assert.equal(selectMarketSnapshot(null, next, '2026-10-22').snapshot.META.asOf, '2026-10-23', 'valid intraday data regressed');
assert.throws(() => selectMarketSnapshot(null, null, '2026-10-22'));
assert.throws(() => selectMarketSnapshot(null, saved, '2026-10-23'), /배포를 중단/);
assert.throws(() => selectMarketSnapshot(null, { META: {}, ROWS: saved.ROWS }, '2026-10-22'));
console.log('Market snapshot: date rollback, missing data, final/intraday regression, mixed dates, original timestamp, safe fallback and fail-closed publication passed.');
