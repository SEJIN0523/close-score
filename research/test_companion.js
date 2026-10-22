const assert = require('node:assert/strict');
const buddy = require('../scoring/companion.js');
const input = { pnl: 12345, records: 2, pending: 3 }, original = JSON.stringify(input);
const finance = data => buddy.describe(data, 'hold');
assert.equal(finance(input).pose, 'happy'); assert.equal(finance(input).art, 'portrait');
assert.match(finance(input).caption, /총손익 기준.*\+12,345원/);
assert.equal(finance({ ...input, pnl: -12345 }).pose, 'sad');
assert.match(finance({ ...input, pnl: -12345 }).caption, /-12,345원/);
for (const pnl of [0,.1,-.1,NaN]) { assert.equal(finance({ ...input, pnl }).pose, 'guide'); assert.equal(finance({ ...input, pnl }).pnl, 0); }
assert.equal(finance({ ...input, records: 0 }).pose, 'guide');
for (const tab of ['hold','stat']) assert.equal(buddy.describe(input, tab).art, 'portrait');
for (const [tab,pose] of [['todo','guide'],['rec','reading'],['watch','welcome']]) {
 const view=buddy.describe(input,tab);assert.equal(view.art,'scene');assert.equal(view.pose,pose);assert.equal(view.sign,'');
}
assert.match(buddy.describe(input).message, /3건/);
buddy.update(input); assert.equal(JSON.stringify(input), original);
console.log('Companion: contextual illustrations, P&L portraits, neutral/empty accounts, rounded zero and read-only input passed.');
