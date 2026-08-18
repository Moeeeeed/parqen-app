// scripts/fix-8-more-balances.js
// ONE-TIME repair: restore 8 more users to their last-known-good balances
// before manual SQL over-corrections drove them negative.
//
// Each target is corroborated by balance_audit INTEGRITY_SYNC history AND
// a manual cross-check of wallet_transactions for any legitimate activity
// after the last audit confirmation (catches cases where the audit trail
// itself was stale):
//   - king_cash1: audit trail was stale (last confirmed 06-19), but her
//     transaction history shows a legitimate TRANSFER_OUT of her entire
//     0.00931963 BTC to @Iraqiy_Xchange on 06-20 — true balance is 0, not
//     the stale audit value.
//   - alicebuyer: audit trail was stale (last confirmed 06-19 at 9.4e-7),
//     but two legitimate TRANSFER_IN credits (0.00003290 + 0.00001645)
//     landed on 06-24 after that reading — true balance is 0.00005029.
//   - all others: audit trail confirmed recently with no intervening
//     legitimate activity, used as-is.
//
// Usage:
//   node scripts/fix-8-more-balances.js          <- dry run
//   node scripts/fix-8-more-balances.js --apply   <- write the fixes

'use strict';

const path   = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const TARGETS = [
  { name: 'kolamoney01',  userId: '77d393b3-2148-4c0c-9e4b-d4c6e67d6700', target: 0.00378090 },
  { name: 'naa_debby',    userId: 'd978d783-f67e-43e2-a056-c2bd6cc006a8', target: 0.00074849 },
  { name: 'deborahigho',  userId: 'aea3c038-ff4e-438e-99bd-1b6117fbd9b2', target: 0.00000107 },
  { name: 'toptrader',    userId: '6c238a2a-e908-464d-a9a3-c92b11498ade', target: 0.00167065 },
  { name: 'king_cash1',   userId: '71f8e74b-ef51-4538-924b-5d6efc7d6ee0', target: 0.00000000 },
  { name: 'alicebuyer',   userId: '9b26de2f-9643-4883-b9df-73083d7a968a', target: 0.00005029 },
  { name: 'holygrunter',  userId: '830c1175-6615-42b3-b9ca-35f1c9e7eaf9', target: 0.00000310 },
  { name: 'Noble_s',      userId: '4de095d5-5366-47de-8bb2-74ff21a1fa3b', target: 0.00000034 },
];

const DRY_RUN = !process.argv.includes('--apply');

function fmt(n) { return parseFloat(n || 0).toFixed(8); }

async function main() {
  console.log(`\n=== Balance repair for 8 users — ${DRY_RUN ? 'DRY RUN' : 'APPLY'} ===\n`);

  for (const t of TARGETS) {
    console.log(`--- ${t.name} (${t.userId}) ---`);

    const { data: wallet, error: wErr } = await db.from('wallets').select('*').eq('user_id', t.userId).maybeSingle();
    if (wErr || !wallet) { console.error(`  ABORT: could not load wallets row: ${wErr?.message}`); continue; }

    const { data: ub } = await db.from('user_balances').select('balance_btc').eq('user_id', t.userId).maybeSingle();
    const { data: uw } = await db.from('user_wallets').select('balance_btc').eq('user_id', t.userId).maybeSingle();

    const existingLocked = parseFloat(wallet.locked_balance_btc || 0);
    if (existingLocked !== 0) {
      console.error(`  ABORT: locked_balance_btc is ${fmt(existingLocked)}, expected 0 — active trade in progress, re-investigate before running.`);
      continue;
    }

    const currentWalletBtc = parseFloat(wallet.balance_btc || 0);
    console.log(`  wallets.balance_btc:       ${fmt(currentWalletBtc)}  -> ${fmt(t.target)}`);
    console.log(`  user_balances.balance_btc: ${fmt(ub?.balance_btc)}  -> ${fmt(t.target)}`);
    console.log(`  user_wallets.balance_btc:  ${fmt(uw?.balance_btc)}  -> ${fmt(t.target)}`);

    if (DRY_RUN) continue;

    const { error: walletUpdErr } = await db
      .from('wallets')
      .update({ balance_btc: t.target, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId)
      .eq('balance_btc', currentWalletBtc);
    if (walletUpdErr) { console.error(`  FAILED wallets update: ${walletUpdErr.message}`); continue; }
    console.log(`  ✅ wallets.balance_btc -> ${fmt(t.target)}`);

    const { error: ubUpdErr } = await db
      .from('user_balances')
      .update({ balance_btc: t.target, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId);
    if (ubUpdErr) console.error(`  ⚠️  user_balances update failed: ${ubUpdErr.message}`);
    else console.log(`  ✅ user_balances.balance_btc -> ${fmt(t.target)}`);

    const { error: uwUpdErr } = await db
      .from('user_wallets')
      .update({ balance_btc: t.target, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId);
    if (uwUpdErr) console.error(`  ⚠️  user_wallets update failed: ${uwUpdErr.message}`);
    else console.log(`  ✅ user_wallets.balance_btc -> ${fmt(t.target)}`);

    await db.from('balance_audit').insert({
      user_id:     t.userId,
      change_btc:  parseFloat((t.target - currentWalletBtc).toFixed(8)),
      new_balance: t.target,
      reason:      'MANUAL_CORRECTION_RESTORE_FROM_AUDIT',
      created_at:  new Date().toISOString(),
    }).then(null, e => console.warn(`  balance_audit insert failed (non-fatal): ${e.message}`));

    await db.from('notifications').insert({
      user_id:    t.userId,
      type:       'wallet',
      title:      '₿ Balance Corrected',
      message:    `We found and fixed an issue with your wallet balance. Your available balance is now ₿${fmt(t.target)}.`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    }).then(null, e => console.warn(`  notification insert failed (non-fatal): ${e.message}`));

    console.log(`  ✅ Done: ${t.name} -> ${fmt(t.target)} BTC\n`);
  }

  if (DRY_RUN) console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
