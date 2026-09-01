// backend/scripts/verify-user-balances-mismatches.js
// PRAQEN — User Balances Mismatch Verification (READ-ONLY)
//
// For each of the 51 users where user_balances.balance_btc differs from
// wallets.balance_btc, reconstruct the expected balance from wallet_transactions
// and classify each as VERIFIED, NEEDS_REVIEW, or UNEXPLAINED.
//
// This script NEVER modifies any table.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY is required. Aborting.');
  process.exit(1);
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('Building 51-case verification report (READ-ONLY)...');

  // Get all 51 mismatches
  const { data: mismatches, error: mismatchErr } = await supabaseAdmin
    .from('wallets')
    .select('user_id, balance_btc')
    .neq('balance_btc', 0);

  if (mismatchErr) {
    console.error('Error fetching wallets:', mismatchErr.message);
    process.exit(1);
  }

  const report = [];

  for (const w of mismatches || []) {
    const { data: ub, error: ubErr } = await supabaseAdmin
      .from('user_balances')
      .select('balance_btc')
      .eq('user_id', w.user_id)
      .maybeSingle();

    if (ubErr || !ub) continue;

    const walletBal = parseFloat(w.balance_btc || 0);
    const userBal = parseFloat(ub.balance_btc || 0);

    if (Math.abs(walletBal - userBal) < 0.00000001) continue;

    // Get all BTC transactions for this user
    const { data: txs, error: txErr } = await supabaseAdmin
      .from('wallet_transactions')
      .select('type, status, amount_btc, created_at, notes')
      .eq('user_id', w.user_id)
      .eq('currency', 'BTC')
      .order('created_at', { ascending: true });

    if (txErr) {
      report.push({
        user_id: w.user_id,
        wallet_balance: walletBal,
        user_balance: userBal,
        classification: 'ERROR',
        error: txErr.message
      });
      continue;
    }

    let confirmedDeposits = 0;
    let reversedDeposits = 0;
    let withdrawals = 0;
    let transfersIn = 0;
    let transfersOut = 0;
    let escrowLocks = 0;
    let escrowRefunds = 0;
    let escrowReleases = 0;
    let sweeps = 0;

    for (const tx of txs || []) {
      const amt = parseFloat(tx.amount_btc || 0);
      switch (tx.type) {
        case 'DEPOSIT':
          if (tx.status === 'CONFIRMED') confirmedDeposits += amt;
          else if (tx.status === 'REVERSED') reversedDeposits += amt;
          break;
        case 'WITHDRAWAL':
          withdrawals += amt;
          break;
        case 'TRANSFER_IN':
          transfersIn += amt;
          break;
        case 'TRANSFER_OUT':
          transfersOut += amt;
          break;
        case 'ESCROW_LOCK':
          escrowLocks += amt;
          break;
        case 'ESCROW_REFUND':
        case 'ESCROW_RELEASE':
          escrowRefunds += amt;
          break;
        case 'SWEEP':
          sweeps += amt;
          break;
      }
    }

    // Reconstruct expected balance
    const netDeposits = confirmedDeposits;
    const netDebits = withdrawals + transfersOut + sweeps;
    const netCredits = transfersIn + escrowRefunds;
    const reconstructed = netDeposits + netCredits - netDebits - escrowLocks;

    // Classify
    let classification = 'UNEXPLAINED';
    const diff = Math.abs(reconstructed - walletBal);

    if (diff < 0.00000001) {
      classification = 'VERIFIED';
    } else if (diff < 0.001) {
      classification = 'NEEDS_REVIEW';
    } else {
      classification = 'UNEXPLAINED';
    }

    report.push({
      user_id: w.user_id,
      wallet_balance: walletBal,
      user_balance: userBal,
      reconstructed_balance: reconstructed,
      difference_from_reconstructed: walletBal - reconstructed,
      confirmed_deposits: confirmedDeposits,
      reversed_deposits: reversedDeposits,
      withdrawals: withdrawals,
      transfers_in: transfersIn,
      transfers_out: transfersOut,
      escrow_locks: escrowLocks,
      escrow_refunds: escrowRefunds,
      sweeps: sweeps,
      classification: classification,
      last_activity: txs?.length > 0 ? txs[txs.length - 1].created_at : null
    });
  }

  // Sort by classification
  report.sort((a, b) => {
    const order = { VERIFIED: 1, NEEDS_REVIEW: 2, UNEXPLAINED: 3 };
    return (order[a.classification] || 4) - (order[b.classification] || 4);
  });

  const filename = 'backend/scripts/user-balances-verification-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.writeFileSync(filename, JSON.stringify({
    generated_at: new Date().toISOString(),
    total_cases: report.length,
    verified_count: report.filter(r => r.classification === 'VERIFIED').length,
    needs_review_count: report.filter(r => r.classification === 'NEEDS_REVIEW').length,
    unexplained_count: report.filter(r => r.classification === 'UNEXPLAINED').length,
    cases: report
  }, null, 2));

  console.log('\n--- Verification Summary ---');
  console.log('Total cases:', report.length);
  console.log('VERIFIED:', report.filter(r => r.classification === 'VERIFIED').length);
  console.log('NEEDS_REVIEW:', report.filter(r => r.classification === 'NEEDS_REVIEW').length);
  console.log('UNEXPLAINED:', report.filter(r => r.classification === 'UNEXPLAINED').length);
  console.log('Report saved to:', filename);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
