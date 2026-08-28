// backend/scripts/reconcile-btc-mirrors-candidates.js
// PRAQEN — BTC Mirror Correction Candidates (DRY-RUN ONLY)
//
// Identifies WALLET_MIRROR_DRIFT cases where:
//   - user_balances.balance_btc matches wallets.balance_btc
//   - user_wallets.balance_btc is different
//
// Produces proposed corrections WITHOUT modifying any table.
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
  console.log('Finding BTC mirror correction candidates (DRY-RUN ONLY)...');

  const { data: wallets, error: walletErr } = await supabaseAdmin
    .from('wallets')
    .select('user_id, balance_btc');

  if (walletErr) {
    console.error('Error fetching wallets:', walletErr.message);
    process.exit(1);
  }

  const candidates = [];
  const skipped = [];

  for (const w of wallets || []) {
    const walletBal = parseFloat(w.balance_btc || 0);

    // Get user_balances
    const { data: ub, error: ubErr } = await supabaseAdmin
      .from('user_balances')
      .select('balance_btc')
      .eq('user_id', w.user_id)
      .maybeSingle();

    if (ubErr) {
      skipped.push({ user_id: w.user_id, reason: 'user_balances error: ' + ubErr.message });
      continue;
    }

    // Get user_wallets
    const { data: uw, error: uwErr } = await supabaseAdmin
      .from('user_wallets')
      .select('balance_btc')
      .eq('user_id', w.user_id)
      .maybeSingle();

    if (uwErr) {
      skipped.push({ user_id: w.user_id, reason: 'user_wallets error: ' + uwErr.message });
      continue;
    }

    const userBal = parseFloat(ub?.balance_btc || 0);
    const walletMirror = parseFloat(uw?.balance_btc || 0);

    // Check WALLET_MIRROR_DRIFT condition:
    // user_balances matches wallets, but user_wallets does not
    if (Math.abs(userBal - walletBal) < 0.00000001 && Math.abs(walletMirror - walletBal) >= 0.00000001) {
      candidates.push({
        user_id: w.user_id,
        current_wallet_balance: walletBal,
        current_user_balance: userBal,
        current_wallet_mirror: walletMirror,
        proposed_wallet_mirror: walletBal,
        difference_to_fix: walletBal - walletMirror,
        change_type: 'WALLET_MIRROR_ONLY'
      });
    } else if (Math.abs(userBal - walletBal) >= 0.00000001 && Math.abs(walletMirror - walletBal) >= 0.00000001) {
      skipped.push({
        user_id: w.user_id,
        reason: 'BOTH_MIRRORS_DRIFT — needs manual review',
        wallet_balance: walletBal,
        user_balance: userBal,
        wallet_mirror: walletMirror
      });
    } else {
      // No drift
    }
  }

  // Sort by absolute difference
  candidates.sort((a, b) => Math.abs(b.difference_to_fix) - Math.abs(a.difference_to_fix));

  const totalFix = candidates.reduce((sum, c) => sum + Math.abs(c.difference_to_fix), 0);

  const report = {
    generated_at: new Date().toISOString(),
    candidates_count: candidates.length,
    skipped_count: skipped.length,
    total_btc_to_fix: totalFix,
    candidates: candidates,
    skipped: skipped
  };

  const filename = 'backend/scripts/correction-candidates-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.writeFileSync(filename, JSON.stringify(report, null, 2));

  console.log('Candidates report saved to:', filename);
  console.log('Candidates (WALLET_MIRROR_ONLY):', candidates.length);
  console.log('Skipped (need manual review):', skipped.length);
  console.log('Total BTC to fix:', totalFix.toFixed(8));
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
