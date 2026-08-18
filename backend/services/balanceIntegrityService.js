// services/balanceIntegrityService.js
// PRAQEN — Daily Balance Integrity Checker
//
// Strategy: compare wallets.balance_btc (primary source of truth, updated
// atomically on every trade/deposit/withdrawal) against user_balances.balance_btc
// (secondary denormalised table). When they drift, sync user_balances to match wallets.
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
  let checked = 0, corrected = 0, errors = 0;

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
            `wallets=${trueBtc.toFixed(8)} user_balances=${secondaryBtc.toFixed(8)} diff=${diff.toFixed(8)}`
          );

          // Sync user_balances to match wallets (never the other way — wallets is authoritative)
          const { error: updateErr } = await supabaseAdmin
            .from('user_balances')
            .update({ balance_btc: trueBtc, updated_at: new Date().toISOString() })
            .eq('user_id', userId);

          if (updateErr) {
            console.error(`[BalanceIntegrity] Failed to sync user ${userId.slice(0,8)}:`, updateErr.message);
            errors++;
            continue;
          }

          // Log to audit table (non-fatal if table doesn't exist)
          try {
            await supabaseAdmin.from('balance_audit').insert({
              user_id:     userId,
              change_btc:  parseFloat((trueBtc - secondaryBtc).toFixed(8)),
              new_balance: trueBtc,
              reason:      'INTEGRITY_SYNC',
              created_at:  new Date().toISOString(),
            });
          } catch (_) {}

          corrected++;
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
    `checked: ${checked}, corrected: ${corrected}, errors: ${errors}`
  );

  return { checked, corrected, errors };
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
