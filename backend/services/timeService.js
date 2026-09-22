// services/timeService.js — server-time drift guard for TOTP (Issue 4).
//
// TOTP validation is fundamentally a clock comparison: the server and the
// authenticator app each compute the 30-second time-step from their own view
// of Unix time. If the server's clock is skewed, every code the user enters
// — even a perfectly correct one — lands outside the verification window and
// fails. Clock drift is the #1 cause of "Invalid code" with a correct app
// code, so TOTP endpoints call checkClockHealth() to surface it loudly.

const DRIFT_RECHECK_MS = 10 * 60 * 1000; // re-measure at most every 10 minutes
const DRIFT_WARN_MS = 15000;             // warn at ≥15s (half a time-step)
const WARN_THROTTLE_MS = 5 * 60 * 1000;  // log at most once per 5 minutes

let cachedDriftMs = null;
let measuredAt = 0;
let lastWarnedAt = 0;

async function measureDrift() {
  // WorldtimeAPI returns the current Unix time from an NTP-backed source —
  // lightweight, no API key. A hard 2s timeout keeps a slow/unreachable
  // probe from ever blocking a TOTP request.
  const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', {
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`worldtimeapi responded ${res.status}`);
  const data = await res.json();
  return Date.now() - Number(data.unixtime) * 1000;
}

/**
 * Measures (and caches) server clock drift vs an NTP-backed source.
 * Never throws: on probe failure the last measurement is reused (possibly
 * null → treated as zero drift, with `stale: true` so callers can note it).
 * @returns {Promise<{driftMs: number, stale: boolean}>}
 */
async function clockDrift() {
  if (cachedDriftMs !== null && Date.now() - measuredAt < DRIFT_RECHECK_MS) {
    return { driftMs: cachedDriftMs, stale: false };
  }
  try {
    cachedDriftMs = await measureDrift();
    measuredAt = Date.now();
    return { driftMs: cachedDriftMs, stale: false };
  } catch (e) {
    console.warn('[timeService] drift probe failed, reusing last measurement:', e.message);
    return { driftMs: cachedDriftMs ?? 0, stale: cachedDriftMs === null };
  }
}

/**
 * Called by TOTP endpoints before verification. Logs a throttled, loud
 * warning when server clock drift exceeds half a time-step (≥15s), which is
 * when boundary codes start failing — and at ≥30s (a full step) correct
 * codes fail outright. Log-only: it must never block or fail a request.
 * @returns {Promise<number>} current drift in milliseconds
 */
async function checkClockHealth() {
  const { driftMs, stale } = await clockDrift();
  const abs = Math.abs(driftMs);
  if (abs >= DRIFT_WARN_MS && Date.now() - lastWarnedAt > WARN_THROTTLE_MS) {
    lastWarnedAt = Date.now();
    console.warn(
      `[timeService] ⚠️ Server clock drift is ${Math.round(driftMs)}ms vs NTP` +
      `${stale ? ' (stale measurement — probe unreachable)' : ''}. ` +
      (abs >= 30000
        ? 'Drift exceeds one TOTP time-step — authenticator codes WILL be rejected. Sync the server clock via NTP immediately.'
        : 'Boundary codes may be rejected near the 30s step edge. Sync the server clock via NTP.')
    );
  }
  return driftMs;
}

module.exports = { checkClockHealth, clockDrift };
