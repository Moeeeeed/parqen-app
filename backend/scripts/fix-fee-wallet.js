// scripts/fix-fee-wallet.js
// ONE-TIME repair: restore the platform fee wallet ("praqen",
// 14762cd0-d3b2-474f-acab-fe0071961e9a) BTC balance to its last-known-good
// value before manual SQL over-corrections drove it down.
//
// balance_audit shows a clean, steadily-increasing INTEGRITY_SYNC trail
// (organic fee accumulation from completed trades) landing on 0.00153761
// repeatedly between 2026-08-18T09:11 and 11:13 — the same cutoff point
// where the 5 other corrupted accounts were last confirmed good. Current
// wallets.balance_btc (0.00012486) is far below both that audit trail AND
// the FEE-type wallet_transactions ledger sum (~0.00103 BTC), so this is
// the same class of corruption, not a legitimate change.
//
// USDT balance (36.741885) is left untouched — it roughly matches its own
// FEE-type ledger sum (36.641884) and shows no audit-trail evidence of
// corruption.
//
// Usage:
//   node scripts/fix-fee-wallet.js          <- dry run
//   node scripts/fix-fee-wallet.js --apply   <- write the fix

'use strict';

const path   = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USER_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a'; // praqen fee wallet
const TARGET_BTC = 0.00153761;
const DRY_RUN = !process.argv.includes('--apply');

function fmt(n) { return parseFloat(n || 0).toFixed(8); }

async function main() {
  console.log(`\n=== praqen fee wallet BTC repair — ${DRY_RUN ? 'DRY RUN' : 'APPLY'} ===\n`);

  const { data: wallet, error: wErr } = await db.from('wallets').select('*').eq('user_id', USER_ID).maybeSingle();
  if (wErr || !wallet) { console.error('ABORT: could not load wallets row:', wErr?.message); process.exit(1); }

  const { data: ub } = await db.from('user_balances').select('balance_btc').eq('user_id', USER_ID).maybeSingle();
  const { data: uw } = await db.from('user_wallets').select('balance_btc').eq('user_id', USER_ID).maybeSingle();

  const existingLocked = parseFloat(wallet.locked_balance_btc || 0);
  if (existingLocked !== 0) {
    console.error(`ABORT: locked_balance_btc is ${fmt(existingLocked)}, expected 0 — re-investigate before running.`);
    process.exit(1);
  }

  const currentBtc = parseFloat(wallet.balance_btc || 0);
  if (currentBtc >= TARGET_BTC) {
    console.error(`ABORT: wallets.balance_btc is already ${fmt(currentBtc)} (>= target ${fmt(TARGET_BTC)}) — already fixed or state changed. Not applying.`);
    process.exit(1);
  }

  console.log('Current state:');
  console.log(`  wallets.balance_btc:       ${fmt(currentBtc)}  -> ${fmt(TARGET_BTC)}`);
  console.log(`  user_balances.balance_btc: ${fmt(ub?.balance_btc)}  -> ${fmt(TARGET_BTC)}`);
  console.log(`  user_wallets.balance_btc:  ${fmt(uw?.balance_btc)}  -> ${fmt(TARGET_BTC)}`);
  console.log(`  balance_usdt: ${wallet.balance_usdt} (left untouched)`);

  if (DRY_RUN) { console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.'); return; }

  const { error: walletUpdErr } = await db
    .from('wallets')
    .update({ balance_btc: TARGET_BTC, updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID)
    .eq('balance_btc', currentBtc);
  if (walletUpdErr) { console.error('FAILED wallets update:', walletUpdErr.message); process.exit(1); }
  console.log(`✅ wallets.balance_btc -> ${fmt(TARGET_BTC)}`);

  const { error: ubUpdErr } = await db
    .from('user_balances')
    .update({ balance_btc: TARGET_BTC, updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID);
  if (ubUpdErr) console.error('⚠️  user_balances update failed:', ubUpdErr.message);
  else console.log(`✅ user_balances.balance_btc -> ${fmt(TARGET_BTC)}`);

  const { error: uwUpdErr } = await db
    .from('user_wallets')
    .update({ balance_btc: TARGET_BTC, updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID);
  if (uwUpdErr) console.error('⚠️  user_wallets update failed:', uwUpdErr.message);
  else console.log(`✅ user_wallets.balance_btc -> ${fmt(TARGET_BTC)}`);

  await db.from('balance_audit').insert({
    user_id:     USER_ID,
    change_btc:  parseFloat((TARGET_BTC - currentBtc).toFixed(8)),
    new_balance: TARGET_BTC,
    reason:      'MANUAL_CORRECTION_RESTORE_FROM_AUDIT',
    created_at:  new Date().toISOString(),
  }).then(null, e => console.warn('balance_audit insert failed (non-fatal):', e.message));

  console.log(`\n✅ Done. Fee wallet BTC restored to ${fmt(TARGET_BTC)} BTC.`);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
