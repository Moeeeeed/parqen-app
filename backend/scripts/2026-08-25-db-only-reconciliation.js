// READ-ONLY DB reconciliation — Phase 8 of the 2026-08-25 balance integrity fix.
// Compares wallets (authoritative) against its mirrors and against escrow/fee
// records, entirely inside the database — no blockchain API calls, no writes.
// Safe to re-run any time. Writes a JSON report to disk; does not touch any
// balance, and does not write anything to reconciliation_flags either (this is
// a one-off investigation snapshot, not the recurring balanceIntegrityService).

'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PAGE = 1000;
const TOL_BTC = 0.000000011;  // ~1 satoshi
const TOL_USDT = 0.000011;

async function fetchAll(table, select) {
  let rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(select).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

(async () => {
  const report = {
    generated_at: new Date().toISOString(),
    method: 'DB-only (no on-chain calls) — see Phase 8 of BALANCE_MISMATCH_INVESTIGATION.md',
    users_checked: 0,
    btc_mismatches: 0,
    usdt_mismatches: 0,
    total_btc_discrepancy: 0,
    total_usdt_discrepancy: 0,
    negative_or_out_of_range: [],
    mirror_drift: [],       // wallets vs user_balances / user_wallets (BTC)
    escrow_lock_mismatch: [], // sum(escrow_locks LOCKED) vs wallets.locked_balance_*
    fee_reconciliation: {},
  };

  console.log('Fetching wallets...');
  const wallets = await fetchAll('wallets', 'user_id, balance_btc, balance_usdt, locked_balance_btc, locked_balance_usdt');
  console.log(`  ${wallets.length} wallets rows`);

  console.log('Fetching user_balances...');
  const userBalances = await fetchAll('user_balances', 'user_id, balance_btc');
  const ubMap = new Map(userBalances.map(r => [r.user_id, parseFloat(r.balance_btc || 0)]));

  console.log('Fetching user_wallets...');
  const userWallets = await fetchAll('user_wallets', 'user_id, balance_btc');
  const uwMap = new Map(userWallets.map(r => [r.user_id, parseFloat(r.balance_btc || 0)]));

  console.log('Fetching escrow_locks (status=LOCKED)...');
  const lockedEscrows = await fetchAll('escrow_locks', 'seller_id, amount_btc, amount_usdt, currency, status').then(rows => rows.filter(r => r.status === 'LOCKED'));
  const escrowBtcBySeller = new Map();
  const escrowUsdtBySeller = new Map();
  for (const row of lockedEscrows) {
    if (!row.seller_id) continue;
    if ((row.currency || 'BTC') === 'USDT') {
      escrowUsdtBySeller.set(row.seller_id, (escrowUsdtBySeller.get(row.seller_id) || 0) + parseFloat(row.amount_usdt || 0));
    } else {
      escrowBtcBySeller.set(row.seller_id, (escrowBtcBySeller.get(row.seller_id) || 0) + parseFloat(row.amount_btc || 0));
    }
  }

  report.users_checked = wallets.length;

  for (const w of wallets) {
    const btc = parseFloat(w.balance_btc || 0);
    const usdt = parseFloat(w.balance_usdt || 0);
    const lockedBtc = parseFloat(w.locked_balance_btc || 0);
    const lockedUsdt = parseFloat(w.locked_balance_usdt || 0);

    // Sanity: negative or absurd values (would also be caught by the migration's
    // new CHECK constraints going forward — this catches anything already in
    // the table today, before that migration is even applied).
    if (btc < 0 || usdt < 0 || lockedBtc < 0 || lockedUsdt < 0 || btc > 21000000 || usdt > 1000000000) {
      report.negative_or_out_of_range.push({ user_id: w.user_id, balance_btc: btc, balance_usdt: usdt, locked_balance_btc: lockedBtc, locked_balance_usdt: lockedUsdt });
    }

    // Mirror drift: wallets vs user_balances (BTC only — table has no USDT column)
    if (ubMap.has(w.user_id)) {
      const mirror = ubMap.get(w.user_id);
      const diff = Math.abs(btc - mirror);
      if (diff > TOL_BTC) {
        report.btc_mismatches++;
        report.total_btc_discrepancy += diff;
        report.mirror_drift.push({ user_id: w.user_id, source: 'user_balances', wallets_balance_btc: btc, mirror_balance_btc: mirror, diff: parseFloat(diff.toFixed(8)) });
      }
    }
    // Mirror drift: wallets vs user_wallets (BTC only)
    if (uwMap.has(w.user_id)) {
      const mirror = uwMap.get(w.user_id);
      const diff = Math.abs(btc - mirror);
      if (diff > TOL_BTC) {
        report.mirror_drift.push({ user_id: w.user_id, source: 'user_wallets', wallets_balance_btc: btc, mirror_balance_btc: mirror, diff: parseFloat(diff.toFixed(8)) });
      }
    }

    // Escrow lock reconciliation: sum(escrow_locks LOCKED) for this user as
    // seller should equal wallets.locked_balance_btc/usdt for that user.
    const expectedLockedBtc = escrowBtcBySeller.get(w.user_id) || 0;
    if (Math.abs(expectedLockedBtc - lockedBtc) > TOL_BTC) {
      report.escrow_lock_mismatch.push({ user_id: w.user_id, currency: 'BTC', wallets_locked: lockedBtc, escrow_locks_sum: expectedLockedBtc, diff: parseFloat((lockedBtc - expectedLockedBtc).toFixed(8)) });
    }
    const expectedLockedUsdt = escrowUsdtBySeller.get(w.user_id) || 0;
    if (Math.abs(expectedLockedUsdt - lockedUsdt) > TOL_USDT) {
      report.usdt_mismatches++;
      report.total_usdt_discrepancy += Math.abs(expectedLockedUsdt - lockedUsdt);
      report.escrow_lock_mismatch.push({ user_id: w.user_id, currency: 'USDT', wallets_locked: lockedUsdt, escrow_locks_sum: expectedLockedUsdt, diff: parseFloat((lockedUsdt - expectedLockedUsdt).toFixed(6)) });
    }
  }

  // Fee reconciliation: platform_fee_btc/usd charged on COMPLETED trades vs
  // company_profits recorded vs FEE-type wallet_transactions credited to the
  // company wallet.
  console.log('Fetching fee-related records...');
  const completedTrades = await fetchAll('trades', 'id, status, platform_fee_btc, platform_fee_usdt, fee_status').then(rows => rows.filter(r => r.status === 'COMPLETED'));
  const feesCharged_btc = completedTrades.reduce((s, t) => s + parseFloat(t.platform_fee_btc || 0), 0);
  const feesCharged_usdt = completedTrades.reduce((s, t) => s + parseFloat(t.platform_fee_usdt || 0), 0);
  const feesNotCollected = completedTrades.filter(t => t.fee_status && t.fee_status !== 'COLLECTED');

  const companyProfits = await fetchAll('company_profits', 'profit_btc, profit_usd, profit_usdt, status');
  const profitsRecorded_btc = companyProfits.reduce((s, p) => s + parseFloat(p.profit_btc || 0), 0);
  const profitsRecorded_usdt = companyProfits.reduce((s, p) => s + parseFloat(p.profit_usdt || 0), 0);

  report.fee_reconciliation = {
    completed_trades: completedTrades.length,
    fees_charged_btc_from_trades: parseFloat(feesCharged_btc.toFixed(8)),
    fees_charged_usdt_from_trades: parseFloat(feesCharged_usdt.toFixed(6)),
    profits_recorded_btc_in_company_profits: parseFloat(profitsRecorded_btc.toFixed(8)),
    profits_recorded_usdt_in_company_profits: parseFloat(profitsRecorded_usdt.toFixed(6)),
    btc_gap: parseFloat((feesCharged_btc - profitsRecorded_btc).toFixed(8)),
    usdt_gap: parseFloat((feesCharged_usdt - profitsRecorded_usdt).toFixed(6)),
    completed_trades_with_fee_status_not_collected: feesNotCollected.length,
    fee_status_not_collected_sample: feesNotCollected.slice(0, 10).map(t => ({ id: t.id, fee_status: t.fee_status, platform_fee_btc: t.platform_fee_btc, platform_fee_usdt: t.platform_fee_usdt })),
  };

  report.total_btc_discrepancy = parseFloat(report.total_btc_discrepancy.toFixed(8));
  report.total_usdt_discrepancy = parseFloat(report.total_usdt_discrepancy.toFixed(6));

  const outPath = path.join(__dirname, '2026-08-25-db-only-reconciliation-result.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n=== SUMMARY ===');
  console.log('Users checked:', report.users_checked);
  console.log('BTC mirror mismatches (wallets vs user_balances):', report.btc_mismatches);
  console.log('Escrow/USDT-locked mismatches:', report.usdt_mismatches);
  console.log('Total BTC discrepancy:', report.total_btc_discrepancy);
  console.log('Total USDT discrepancy (escrow leg):', report.total_usdt_discrepancy);
  console.log('Negative/out-of-range wallets rows:', report.negative_or_out_of_range.length);
  console.log('Mirror drift entries (both tables):', report.mirror_drift.length);
  console.log('Escrow lock mismatch entries:', report.escrow_lock_mismatch.length);
  console.log('Fee reconciliation:', JSON.stringify(report.fee_reconciliation, null, 2));
  console.log('\nFull report written to:', outPath);
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
