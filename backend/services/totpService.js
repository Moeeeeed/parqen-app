// services/totpService.js — shared TOTP verification for every 2FA code check
// (login verify, setup confirm, event-prefs confirm). One implementation so
// QR generation, storage, and validation can never drift apart on parameters.
//
// Parameters are pinned to what the QR code encodes and what Google
// Authenticator / Authy default to: SHA1, 6 digits, 30-second period, ±1
// step window (accepts the previous, current, and next time-step — boundary
// tolerance so a code entered right as it expires is still accepted).
//
// Before verifying, the server clock is checked against an NTP-backed source
// (services/timeService): drift is the #1 cause of "Invalid code" with a
// genuinely correct app code, so it is flagged loudly in logs instead of
// silently failing the user.
//
// DEBUG LOGGING (temporary, remove before production): on a failed verify,
// logs the submitted code, the codes the server expected for the current and
// ±1 steps, and the server timestamp/step — enough to instantly distinguish
// clock drift (expected codes look "shifted") from a secret mismatch (no
// overlap at all).

const speakeasy = require('speakeasy');
const { checkClockHealth } = require('./timeService');

const TOTP_PARAMS = {
  algorithm: 'sha1',
  digits: 6,
  step: 30,
  window: 1, // previous/current/next 30s step — boundary tolerance
};

/**
 * Verify a submitted TOTP code against a base32 secret.
 * @param {string} userTotpSecret base32 secret stored on the user record
 * @param {string|number} submittedCode raw code as typed/scanned by the user
 * @returns {Promise<boolean>} true when the code is valid within ±1 step
 */
async function verifyTotp(userTotpSecret, submittedCode) {
  // Normalize: strip whitespace/dashes and any non-digit noise, then require
  // exactly 6 digits — avoids trailing-space/OCR-style copy errors.
  const token = String(submittedCode || '').replace(/\D/g, '');
  if (!userTotpSecret || token.length !== TOTP_PARAMS.digits) return false;

  await checkClockHealth();

  const ok = speakeasy.totp.verify({
    secret: userTotpSecret,
    encoding: 'base32',
    token,
    ...TOTP_PARAMS,
  });

  if (!ok) {
    // DEBUG LOGGING (temporary, remove before production)
    const nowSec = Math.floor(Date.now() / 1000);
    const step = Math.floor(nowSec / TOTP_PARAMS.step);
    const expected = [-1, 0, 1].map(off =>
      speakeasy.totp({
        secret: userTotpSecret,
        encoding: 'base32',
        ...TOTP_PARAMS,
        time: (step + off) * TOTP_PARAMS.step,
      })
    );
    console.warn(
      `[TOTP-DEBUG] verify failed: submitted="${token}" ` +
      `expected(now-1,now,now+1)=${expected.join(',')} ` +
      `serverMs=${Date.now()} step=${step}`
    );
  }

  return ok;
}

module.exports = { verifyTotp, TOTP_PARAMS };
