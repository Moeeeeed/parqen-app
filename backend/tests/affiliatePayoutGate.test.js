// Run with:  node tests/affiliatePayoutGate.test.js
// No network, no database. Guards the payout switch so referral money cannot move by accident.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const svc = require('../services/affiliateSummaryService');

let passed = 0;
function t(name, fn) { try { fn(); passed++; console.log('  PASS', name); } catch (e) { console.log('  FAIL', name, '\n     ', e.message); process.exitCode = 1; } }

const original = process.env.REFERRAL_PAYOUTS_ENABLED;
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

console.log('payout switch (REFERRAL_PAYOUTS_ENABLED)');
t('OFF when the variable is missing', () => { delete process.env.REFERRAL_PAYOUTS_ENABLED; assert.strictEqual(svc.cashEnabled(), false); });
['', 'false', 'FALSE', 'True', 'TRUE', '1', 'yes', 'on', ' true', 'true '].forEach((v) => {
  t(`OFF for ${JSON.stringify(v)}`, () => { process.env.REFERRAL_PAYOUTS_ENABLED = v; assert.strictEqual(svc.cashEnabled(), false); });
});
t('ON only for exactly "true"', () => { process.env.REFERRAL_PAYOUTS_ENABLED = 'true'; assert.strictEqual(svc.cashEnabled(), true); });
t('public config mirrors the switch', () => {
  process.env.REFERRAL_PAYOUTS_ENABLED = 'true'; assert.strictEqual(svc.getPublicConfig().cash_enabled, true);
  process.env.REFERRAL_PAYOUTS_ENABLED = 'false'; assert.strictEqual(svc.getPublicConfig().cash_enabled, false);
  delete process.env.REFERRAL_PAYOUTS_ENABLED; assert.strictEqual(svc.getPublicConfig().cash_enabled, false);
});

console.log('\nthe money route is gated (reads server.js)');
const routeLines = server.split('\n').filter((l) => /app\.(post|put|patch|delete)\('\/api\/referral\/withdraw'/.test(l));
t('there is exactly one /api/referral/withdraw route', () => assert.strictEqual(routeLines.length, 1));
t('it runs the payout gate right after login and BEFORE any other check or database work', () => {
  const l = routeLines[0];
  const order = ['verifyToken', 'requireReferralPayoutsEnabled', 'requireNotBanned', 'authLimiter'].map((k) => l.indexOf(k));
  assert.ok(order.every((i) => i > -1), 'a middleware is missing: ' + l);
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'wrong order: ' + l);
});
t('the gate uses the shared switch and answers 403', () => {
  const start = server.indexOf('function requireReferralPayoutsEnabled');
  assert.ok(start > -1, 'gate function not found');
  const body = server.slice(start, start + 600);
  assert.ok(body.includes('affiliateSummaryService') && body.includes('cashEnabled()'));
  assert.ok(body.includes('res.status(403)'));
});
t('the only server route that credits referral earnings to a wallet is the gated one', () => {
  const withdrawWriters = (server.match(/type: 'REFERRAL_WITHDRAWAL'/g) || []).length;
  assert.strictEqual(withdrawWriters, 1, 'REFERRAL_WITHDRAWAL is written in ' + withdrawWriters + ' places');
});
t('the old unused referral route/service files are not loaded by the server', () => {
  assert.ok(!/require\(['"]\.\/routes\/referralRoutes['"]\)/.test(server));
  assert.ok(!/require\(['"]\.\/services\/referralService['"]\)/.test(server));
});

if (original === undefined) delete process.env.REFERRAL_PAYOUTS_ENABLED; else process.env.REFERRAL_PAYOUTS_ENABLED = original;
console.log('\n' + passed + ' checks passed' + (process.exitCode ? ' — SOME FAILED' : ', 0 failed'));
