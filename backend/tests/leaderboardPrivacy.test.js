// Run with:  node --test tests/leaderboardPrivacy.test.js
// The public referral leaderboard may rank people, but must never return money amounts.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').replace(/\r\n/g, '\n');
const start = src.indexOf("app.get('/api/referral/leaderboard'");
const end = src.indexOf('// ── Payout switch', start);
const handler = src.slice(start, end);

test('leaderboard handler is found', () => {
  assert.ok(start > 0 && end > start);
});

test('the response never carries earned_btc / month_btc / commission amounts', () => {
  assert.ok(!/earned_btc/.test(handler), 'earned_btc must not be returned');
  assert.ok(!/month_btc/.test(handler), 'month_btc must not be returned');
  assert.ok(/_rankBtc/.test(handler), 'ranking still uses earnings internally');
  assert.ok(/\.map\(\(\{ _rankBtc, \.\.\.u \}, i\)/.test(handler), 'the internal ranking value is stripped before responding');
});
