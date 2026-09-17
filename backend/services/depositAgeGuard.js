// services/depositAgeGuard.js
// ─────────────────────────────────────────────────────────────────────────────
// CONTAINMENT GUARD — added 2026-09-03.
//
// WHY: a batch of historic, already-credited deposits (some already swept weeks
// earlier) was re-delivered to the monitors and credited a SECOND time, because
// neither existing guard covers deposits that predate them:
//   • deposit_tracking_v2 only knows txids recorded since ~2026-08-27.
//   • praqen_credit_deposit's idempotency key was never set for pre-2026-08-27
//     credits, so `USDT:<user>:<oldTxid>` looked brand new to the RPC.
// See BALANCE_MISMATCH_INVESTIGATION.md.
//
// WHAT: a genuinely NEW deposit is always recent the first time a monitor sees
// it. Anything older than MAX_DEPOSIT_AGE_HOURS is either already credited, or —
// if it was genuinely missed during an outage — must be credited by the reviewed
// one-off back-fill, NEVER auto-credited by a monitor. This module is the single
// source of truth for that cutoff so the three monitors can never drift apart.
//
// This is a stop-gap. The permanent fix is Part 2:
//   2.1a — back-fill wallet_transactions.idempotency_key on historic deposits
//   2.1b — back-fill deposit_tracking_v2 with every historic credited deposit txid
//   2.1c — both monitors check the ledger key + tracker before crediting
//   2.1d — praqen_credit_deposit rejects a mismatched automatic-format key
//
// STEP 2.1e: once 2.1a + 2.1b have been run and verified live, set
//   MAX_DEPOSIT_AGE_HOURS=720   (30 days) in the backend .env
// so a genuinely-missed older deposit can still be auto-picked-up, while the
// back-filled markers (not this window) do the real double-credit prevention.
// No code change is needed for 2.1e — the value below is already env-driven.
// The file default stays at 72 h so it is safe BEFORE the back-fills run.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DEPOSIT_AGE_HOURS = parseInt(process.env.MAX_DEPOSIT_AGE_HOURS || '72', 10);
const MAX_DEPOSIT_AGE_MS = MAX_DEPOSIT_AGE_HOURS * 60 * 60 * 1000;

// Accepts any of: seconds-epoch (BTC esplora/mempool `block_time`),
// milliseconds-epoch (TronGrid `block_timestamp`), ISO date string, or Date.
//
// Returns FALSE (i.e. "do not skip") whenever the timestamp is missing or
// unparseable — fail OPEN so a real deposit is never dropped over a parsing
// quirk. The deposit_tracking_v2 + RPC idempotency checks still run afterwards.
function isDepositTooOld(ts) {
  if (ts === null || ts === undefined || ts === '') return false;

  let ms;
  if (ts instanceof Date) {
    ms = ts.getTime();
  } else if (typeof ts === 'number' || (typeof ts === 'string' && /^\d+$/.test(ts.trim()))) {
    // numeric, or an all-digits string (some APIs return epoch as a string)
    const n = Number(ts);
    ms = n < 1e12 ? n * 1000 : n; // < 1e12 ⇒ value is in seconds, not ms
  } else {
    const parsed = Date.parse(ts);
    ms = Number.isNaN(parsed) ? NaN : parsed;
  }
  if (!Number.isFinite(ms) || ms <= 0) return false;

  return (Date.now() - ms) > MAX_DEPOSIT_AGE_MS;
}

module.exports = { isDepositTooOld, MAX_DEPOSIT_AGE_HOURS };
