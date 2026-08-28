// backend/scripts/verify-btc-mirror-candidates.js
// PRAQEN — Verify BTC Mirror Correction Candidates (READ-ONLY GUARD)
//
// Loads the candidate report, re-checks the database, and confirms
// each candidate is still in the expected state BEFORE any write.
// Makes ZERO database changes.

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
  const reportFile = process.argv[2] || 'backend/scripts/correction-candidates-2026-08-28T12-29-56-975Z.json';
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));

  console.log('Verifying', report.candidates.length, 'candidates (READ-ONLY)...');

  let verified = 0;
  let stale = 0;
  let missing = 0;
  const verifiedList = [];
  const staleList = [];

  for (const c of report.candidates) {
    // Re-read current state
    const { data: wallet, error: wErr } = await supabaseAdmin
      .from('wallets')
      .select('balance_btc')
      .eq('user_id', c.user_id)
      .maybeSingle();

    const { data: ub, error: ubErr } = await supabaseAdmin
      .from('user_balances')
      .select('balance_btc')
      .eq('user_id', c.user_id)
      .maybeSingle();

    const { data: uw, error: uwErr } = await supabaseAdmin
      .from('user_wallets')
      .select('balance_btc')
      .eq('user_id', c.user_id)
      .maybeSingle();

    if (wErr || ubErr || uwErr || !wallet || !ub || !uw) {
      missing++;
      staleList.push({
        user_id: c.user_id,
        reason: 'Missing row — cannot verify'
      });
      continue;
    }

    const walletBal = parseFloat(wallet.balance_btc || 0);
    const userBal = parseFloat(ub.balance_btc || 0);
    const walletMirror = parseFloat(uw.balance_btc || 0);

    // Verify all three conditions still hold
    const conditionsMatch =
      Math.abs(userBal - walletBal) < 0.00000001 &&
      Math.abs(walletMirror - c.current_wallet_mirror) < 0.00000001 &&
      Math.abs(walletBal - c.current_wallet_balance) < 0.00000001;

    if (conditionsMatch) {
      verified++;
      verifiedList.push({
        user_id: c.user_id,
        current_wallet_mirror: walletMirror,
        proposed_wallet_mirror: c.proposed_wallet_mirror,
        verification: 'PASSED'
      });
    } else {
      stale++;
      staleList.push({
        user_id: c.user_id,
        expected_wallet: c.current_wallet_balance,
        actual_wallet: walletBal,
        expected_user_balance: c.current_user_balance,
        actual_user_balance: userBal,
        expected_wallet_mirror: c.current_wallet_mirror,
        actual_wallet_mirror: walletMirror,
        reason: 'STATE CHANGED since report'
      });
    }
  }

  const verificationReport = {
    generated_at: new Date().toISOString(),
    total_candidates: report.candidates.length,
    verified: verified,
    stale: stale,
    missing: missing,
    verified_list: verifiedList,
    stale_list: staleList
  };

  const filename = 'backend/scripts/verification-report-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  fs.writeFileSync(filename, JSON.stringify(verificationReport, null, 2));

  console.log('\n--- Verification Summary ---');
  console.log('Total candidates:', report.candidates.length);
  console.log('Verified (safe):', verified);
  console.log('Stale (changed):', stale);
  console.log('Missing:', missing);
  console.log('Report saved to:', filename);

  if (stale > 0 || missing > 0) {
    console.log('\n⚠️ NOT ALL CANDIDATES VERIFIED — DO NOT APPLY CORRECTIONS YET.');
    process.exit(1);
  }

  console.log('\n✅ ALL CANDIDATES VERIFIED — Safe to apply corrections.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
