// scripts/fix-kingkong79.js
// ONE-TIME repair: restore kingkong79-Pro's available balance_btc to
// 0.00097261 (last-known-good per balance_audit INTEGRITY_SYNC trail).
//
// Unlike the other 3 users, kingkong79-Pro has a genuinely ACTIVE trade
// right now (trade a5efb068, FUNDS_LOCKED, 0.00028213 BTC locked at
// 2026-08-18T12:38, expires 13:08) — unrelated to the historical
// corruption. This script touches ONLY balance_btc (available) and
// leaves locked_balance_btc completely alone so the live trade is
// unaffected.
//
// Usage:
//   node scripts/fix-kingkong79.js          <- dry run
//   node scripts/fix-kingkong79.js --apply   <- write the fix

'use strict';

const path   = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USER_ID = 'e8d3d037-554b-4b09-b8f7-373f03de10de';
const TARGET  = 0.00097261;
const DRY_RUN = !process.argv.includes('--apply');

function fmt(n) { return parseFloat(n || 0).toFixed(8); }

async function main() {
  console.log(`\n=== kingkong79-Pro balance repair — ${DRY_RUN ? 'DRY RUN' : 'APPLY'} ===\n`);

  const { data: wallet, error: wErr } = await db.from('wallets').select('*').eq('user_id', USER_ID).maybeSingle();
  if (wErr || !wallet) { console.error('ABORT: could not load wallets row:', wErr?.message); process.exit(1); }

  const currentBtc = parseFloat(wallet.balance_btc || 0);
  const locked     = parseFloat(wallet.locked_balance_btc || 0);

  console.log(`  wallets.balance_btc:        ${fmt(currentBtc)}  -> ${fmt(TARGET)}`);
  console.log(`  wallets.locked_balance_btc: ${fmt(locked)}  (left untouched — active trade)`);

  if (DRY_RUN) { console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.'); return; }

  const { error: walletUpdErr } = await db
    .from('wallets')
    .update({ balance_btc: TARGET, updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID)
    .eq('balance_btc', currentBtc); // optimistic lock — does NOT touch locked_balance_btc
  if (walletUpdErr) { console.error('FAILED wallets update:', walletUpdErr.message); process.exit(1); }
  console.log(`  ✅ wallets.balance_btc -> ${fmt(TARGET)} (locked_balance_btc untouched)`);

  const { error: ubUpdErr } = await db
    .from('user_balances')
    .update({ balance_btc: TARGET, updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID);
  if (ubUpdErr) console.error('  ⚠️  user_balances update failed:', ubUpdErr.message);
  else console.log(`  ✅ user_balances.balance_btc -> ${fmt(TARGET)}`);

  const { error: uwUpdErr } = await db
    .from('user_wallets')
    .update({ balance_btc: TARGET, updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID);
  if (uwUpdErr) console.error('  ⚠️  user_wallets update failed:', uwUpdErr.message);
  else console.log(`  ✅ user_wallets.balance_btc -> ${fmt(TARGET)}`);

  await db.from('balance_audit').insert({
    user_id:     USER_ID,
    change_btc:  parseFloat((TARGET - currentBtc).toFixed(8)),
    new_balance: TARGET,
    reason:      'MANUAL_CORRECTION_RESTORE_FROM_AUDIT',
    created_at:  new Date().toISOString(),
  }).then(null, e => console.warn('  balance_audit insert failed (non-fatal):', e.message));

  await db.from('notifications').insert({
    user_id:    USER_ID,
    type:       'wallet',
    title:      '₿ Balance Corrected',
    message:    `We found and fixed an issue with your wallet balance. Your available balance is now ₿${fmt(TARGET)}.`,
    action:     '/wallet',
    is_read:    false,
    created_at: new Date().toISOString(),
  }).then(null, e => console.warn('  notification insert failed (non-fatal):', e.message));

  console.log(`\n✅ Done. kingkong79-Pro available balance restored to ${fmt(TARGET)} BTC.`);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
