// tests/totp.test.js — automated regression test for shared TOTP verification
// (Issue 4, acceptance #8). Run with:  node --test tests/totp.test.js
//
// Generates a known base32 secret, computes the expected 6-digit code with
// speakeasy itself (the same standard library the backend uses), and asserts
// verifyTotp accepts it — including codes from the previous and next 30s
// time-steps (the ±1 window boundary tolerance).

const { test, describe } = require('node:test');
const assert = require('node:assert');
const speakeasy = require('speakeasy');
const { verifyTotp, TOTP_PARAMS } = require('../services/totpService');

// A fixed, RFC-4227-style base32 secret (must have no padding issues and be
// a valid base32 charset). 32 chars = 160 bits, same as speakeasy generates.
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function codeAt(offsetSteps = 0) {
  const nowSec = Math.floor(Date.now() / 1000);
  const step = Math.floor(nowSec / TOTP_PARAMS.step);
  return speakeasy.totp({
    secret: SECRET,
    encoding: 'base32',
    algorithm: 'sha1',
    digits: 6,
    step: 30,
    time: (step + offsetSteps) * 30,
  });
}

describe('verifyTotp (shared TOTP verification)', () => {
  test('accepts the current correct code', async () => {
    const code = codeAt(0);
    assert.match(code, /^\d{6}$/);
    assert.strictEqual(await verifyTotp(SECRET, code), true);
  });

  test('accepts the previous step code (−1 window)', async () => {
    assert.strictEqual(await verifyTotp(SECRET, codeAt(-1)), true);
  });

  test('accepts the next step code (+1 window)', async () => {
    assert.strictEqual(await verifyTotp(SECRET, codeAt(+1)), true);
  });

  test('rejects a code outside the ±1 window', async () => {
    // A code from 4 steps in the future is never valid at window=1.
    const farFuture = speakeasy.totp({
      secret: SECRET, encoding: 'base32', algorithm: 'sha1', digits: 6, step: 30,
      time: (Math.floor(Date.now() / 1000 / 30) + 4) * 30,
    });
    assert.strictEqual(await verifyTotp(SECRET, farFuture), false);
  });

  test('rejects a wrong 6-digit code', async () => {
    const code = codeAt(0);
    const wrong = String((parseInt(code, 10) + 1) % 1000000).padStart(6, '0');
    assert.strictEqual(await verifyTotp(SECRET, wrong), false);
  });

  test('normalizes formatting noise (spaces, dashes)', async () => {
    const code = codeAt(0);
    const noisy = ` ${code.slice(0, 3)}-${code.slice(3)} `;
    assert.strictEqual(await verifyTotp(SECRET, noisy), true);
  });

  test('rejects non-6-digit input without touching the verifier', async () => {
    assert.strictEqual(await verifyTotp(SECRET, '12345'), false);
    assert.strictEqual(await verifyTotp(SECRET, '1234567'), false);
    assert.strictEqual(await verifyTotp(SECRET, ''), false);
    assert.strictEqual(await verifyTotp(SECRET, null), false);
  });

  test('rejects when the secret is missing', async () => {
    assert.strictEqual(await verifyTotp(null, codeAt(0)), false);
    assert.strictEqual(await verifyTotp('', codeAt(0)), false);
  });

  test('rejects a code generated from a DIFFERENT secret (QR↔DB mismatch class)', async () => {
    // Simulates the stale-QR bug: the app shows a code for secret A while the
    // DB holds secret B. This must never verify.
    const otherSecret = speakeasy.generateSecret({ length: 20 }).base32;
    const codeForOther = speakeasy.totp({
      secret: otherSecret, encoding: 'base32', algorithm: 'sha1', digits: 6, step: 30,
    });
    assert.strictEqual(await verifyTotp(SECRET, codeForOther), false);
  });
});
