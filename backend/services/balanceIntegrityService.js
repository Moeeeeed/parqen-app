// services/balanceIntegrityService.js
// PRAQEN — Daily Balance Integrity Checker
//
// Strategy: compare wallets.balance_btc (primary source of truth, updated
// atomically on every trade/deposit/withdrawal) against user_balances.balance_btc
// (secondary denormalised table). When they drift, FLAG it — do not touch either
// balance. See BALANCE_MISMATCH_INVESTIGATION.md (2026-08-25) for why: silently
// overwriting the mirror on every drift papers over the underlying writers that
// caused the drift in the first place, and a "detect -> auto-correct" balance
// tool is itself the kind of blind write that can turn a real discrepancy into
// data loss if the assumption about which side is correct is ever wrong. Every
// mismatch found here is written to reconciliation_flags with status
// RECONCILIATION_REQUIRED for a human to actually investigate.
//
// We do NOT recompute from wallet_transactions because that ledger is incomplete —
// escrow releases, referral commissions, admin credits and bonus payouts update
// wallets directly without always creating a wallet_transactions entry.
//
// When it runs: once on startup, then every 24 hours.

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// 1 satoshi tolerance for floating-point rounding
const TOLERANCE_BTC = 0.000000011;
const PAGE_SIZE     = 50;

async function runIntegrityCheck() {
  console.log('\n🔍 [BalanceIntegrity] Starting daily balance check...');
  const started = Date.now();
  let checked = 0, flagged = 0, errors = 0;

  try {
    let offset  = 0;
    let hasMore = true;

    while (hasMore) {
      // wallets is the source of truth — read it in pages
      const { data: walletRows, error: wErr } = await supabaseAdmin
        .from('wallets')
        .select('user_id, balance_btc')
        .range(offset, offset + PAGE_SIZE - 1);

      if (wErr || !walletRows) {
        console.error('[BalanceIntegrity] Could not fetch wallets:', wErr?.message);
        break;
      }

      hasMore  = walletRows.length === PAGE_SIZE;
      offset  += PAGE_SIZE;

      // Batch-fetch every user_balances row for this page in ONE query instead
      // of one round trip per user. The old per-user select was why a 940-user
      // check took 261s (~1900 sequential Supabase round trips) — that ran on
      // every server startup and every 24h, competing with live traffic for
      // the same connection/rate-limit budget right when things need to be fast.
      const pageUserIds = walletRows.map(w => w.user_id);
      const { data: ubRows, error: ubBatchErr } = pageUserIds.length
        ? await supabaseAdmin.from('user_balances').select('user_id, balance_btc').in('user_id', pageUserIds)
        : { data: [] };
      if (ubBatchErr) console.error('[BalanceIntegrity] Could not batch-fetch user_balances for page:', ubBatchErr.message);
      const ubMap = Object.fromEntries((ubRows || []).map(r => [r.user_id, r.balance_btc]));

      for (const walletRow of walletRows) {
        try {
          const userId        = walletRow.user_id;
          const trueBtc       = parseFloat(parseFloat(walletRow.balance_btc || 0).toFixed(8));

          // Negative wallet balance is itself a data problem — skip and flag
          if (trueBtc < 0) {
            console.error(
              `[BalanceIntegrity] ❌ Negative wallets.balance_btc for user ${userId.slice(0,8)} ` +
              `(${trueBtc.toFixed(8)} BTC) — manual review needed`
            );
            errors++;
            continue;
          }

          checked++;

          if (ubBatchErr) { errors++; continue; } // batch fetch failed — can't verify this page

          const secondaryBtc = parseFloat(parseFloat(ubMap[userId] || 0).toFixed(8));
          const diff         = Math.abs(trueBtc - secondaryBtc);

          if (diff <= TOLERANCE_BTC) continue; // in sync — nothing to do

          console.warn(
            `[BalanceIntegrity] ⚠️  MISMATCH user ${userId.slice(0,8)}: ` +
            `wallets=${trueBtc.toFixed(8)} user_balances=${secondaryBtc.toFixed(8)} diff=${diff.toFixed(8)} — flagging for reconciliation`
          );

          // Skip if this user already has an unresolved MIRROR_DRIFT flag —
          // without this, every restart re-runs the "once at startup" check
          // (this job is meant to run once every 24h, but the backend process
          // restarts far more often than that) and blindly inserts another
          // duplicate row for the same still-unresolved drift. Confirmed
          // 2026-09-19/20: this grew the table from a few genuine findings to
          // 1,800+ rows, burying real signal (donbillion1's and jabyru_113's
          // genuine cases sat unnoticed under the noise). Same de-dup pattern
          // already used correctly in depositReconciliationService.js's
          // raiseFlag().
          const { data: existingFlag } = await supabaseAdmin
            .from('reconciliation_flags')
            .select('id')
            .eq('user_id', userId).eq('reason', 'MIRROR_DRIFT').eq('status', 'RECONCILIATION_REQUIRED')
            .maybeSingle();

          if (existingFlag) {
            flagged++; // still a real, current mismatch — just don't re-insert it
            continue;
          }

          // Flag for a human to investigate. Do NOT touch either balance — see the
          // file header comment for why "detect and auto-correct" is exactly the
          // pattern this tool used to have and no longer does.
          const { error: flagErr } = await supabaseAdmin.from('reconciliation_flags').insert({
            user_id:              userId,
            currency:             'BTC',
            source_table:         'user_balances',
            authoritative_value:  trueBtc,
            mirror_value:         secondaryBtc,
            diff:                 parseFloat((trueBtc - secondaryBtc).toFixed(8)),
            reason:               'MIRROR_DRIFT',
            status:               'RECONCILIATION_REQUIRED',
            detail:               { checked_at: new Date().toISOString() },
          });

          if (flagErr) {
            console.error(`[BalanceIntegrity] Failed to record reconciliation_flags for user ${userId.slice(0,8)}:`, flagErr.message);
            errors++;
            continue;
          }

          flagged++;
        } catch (userErr) {
          errors++;
          console.error('[BalanceIntegrity] Error processing user:', userErr.message);
        }
      }

      // Small pause between pages to avoid DB bursts
      if (hasMore) await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    console.error('[BalanceIntegrity] Fatal error:', err.message);
  }

  const ms = Date.now() - started;
  console.log(
    `✅ [BalanceIntegrity] Done in ${ms}ms — ` +
    `checked: ${checked}, flagged: ${flagged}, errors: ${errors}`
  );

  return { checked, flagged, errors };
}

function start() {
  runIntegrityCheck().catch(err =>
    console.error('[BalanceIntegrity] Startup check failed:', err.message)
  );

  setInterval(() => {
    runIntegrityCheck().catch(err =>
      console.error('[BalanceIntegrity] Scheduled check failed:', err.message)
    );
  }, 24 * 60 * 60 * 1000);

  console.log('🛡️  Balance integrity checker: runs every 24 hours');
}

module.exports = { start, runIntegrityCheck };
