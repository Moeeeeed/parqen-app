// backend/scripts/reconcile-btc-mirrors.js
// PRAQEN — BTC Mirror Reconciliation Report (READ-ONLY)
//
// Produces a dry-run report of all BTC balance mismatches between:
//   - wallets.balance_btc (authoritative)
//   - user_balances.balance_btc (mirror 1)
//   - user_wallets.balance_btc (mirror 2)
//
// This script NEVER modifies any table. It only reads and reports.
// Exit code 0 = success, 1 = error.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function main() {
  console.log('Starting BTC mirror reconciliation report (READ-ONLY)...');

  // Step 1: Get all mismatches
  const { data: mismatches, error: mismatchErr } = await supabaseAdmin
    .from('wallets')
    .select('user_id, balance_btc')
    .neq('balance_btc', 0);

  if (mismatchErr) {
    console.error('Error fetching wallets:', mismatchErr.message);
    process.exit(1);
  }

  const report = [];
  const errors = [];

  for (const w of mismatches) {
    // Get mirror balances
    const { data: ub, error: ubErr } = await supabaseAdmin
      .from('user_balances')
      .select('balance_btc')
      .eq('user_id', w.user_id)
      .maybeSingle();

    const { data: uw, error: uwErr } = await supabaseAdmin
      .from('user_wallets')
      .select('balance_btc')
      .eq('user_id', w.user_id)
      .maybeSingle();

    if (ubErr || uwErr) {
      errors.push({ user_id: w.user_id, error: (ubErr || uwErr).message });
      continue;
    }

    const walletBal = parseFloat(w.balance_btc || 0);
    const userBal = parseFloat(ub?.balance_btc || 0);
    const walletMirror = parseFloat(uw?.balance_btc || 0);

    const userDiff = walletBal - userBal;
    const mirrorDiff = walletBal - walletMirror;

    if (Math.abs(userDiff) > 0.00000001 || Math.abs(mirrorDiff) > 0.00000001) {
      // Get transaction summary
      const { data: txs, error: txErr } = await supabaseAdmin
        .from('wallet_transactions')
        .select('type, status, amount_btc')
        .eq('user_id', w.user_id)
        .eq('currency', 'BTC');

      if (txErr) {
        errors.push({ user_id: w.user_id, error: txErr.message });
        continue;
      }

      let confirmedDeposits = 0;
      let reversedDeposits = 0;
      let withdrawals = 0;
      let transfers = 0;
      let escrowLocks = 0;
      let escrowRefunds = 0;
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
          case 'TRANSFER_OUT':
            transfers += amt;
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

      let classification = 'UNKNOWN';
      if (Math.abs(userDiff) > 0.00000001 && Math.abs(mirrorDiff) > 0.00000001) {
        classification = 'MULTIPLE_FACTORS';
      } else if (Math.abs(mirrorDiff) > 0.00000001) {
        classification = 'WALLET_MIRROR_DRIFT';
      } else if (Math.abs(userDiff) > 0.00000001) {
        classification = 'USER_BALANCE_DRIFT';
      }

      report.push({
        user_id: w.user_id,
        wallet_balance: walletBal,
        user_balance_mirror: userBal,
        wallet_mirror: walletMirror,
        difference_user_balance: userDiff,
        difference_wallet_mirror: mirrorDiff,
        confirmed_deposits: confirmedDeposits,
        reversed_deposits: reversedDeposits,
        withdrawals: withdrawals,
        transfers: transfers,
        escrow_locks: escrowLocks,
        escrow_refunds: escrowRefunds,
        sweeps: sweeps,
        classification: classification,
        confidence: 'LOW'
      });
    }
  }

  // Sort by largest absolute difference
  report.sort((a, b) => {
    const maxA = Math.max(Math.abs(a.difference_user_balance), Math.abs(a.difference_wallet_mirror));
    const maxB = Math.max(Math.abs(b.difference_user_balance), Math.abs(b.difference_wallet_mirror));
    return maxB - maxA;
  });

  // Save report
  const filename = 'backend/scripts/reconciliation-report-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.writeFileSync(filename, JSON.stringify({ generated_at: new Date().toISOString(), mismatches: report, errors }, null, 2));
  console.log('Report saved to:', filename);
  console.log('Total mismatches:', report.length);
  console.log('Errors:', errors.length);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
