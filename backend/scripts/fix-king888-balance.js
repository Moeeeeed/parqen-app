// scripts/fix-king888-balance.js
// ONE-TIME repair: restore king888's real 0.009968 BTC deposit.
//
// ROOT CAUSE: king888 deposited 0.009968 BTC on-chain (swept to the hot wallet
// 2026-08-17T17:26:52, tx 56e3264e...), but the deposit was never mirrored into
// wallet_transactions as a DEPOSIT row (only the internal SWEEP audit row exists,
// which per services/sweepService.js NEVER touches user balances). His real
// balance lived only in wallets.balance_btc / user_balances.balance_btc directly.
// A later manual "recompute balance from wallet_transactions" pass summed the
// ledger (ESCROW_LOCK -0.00633738 + ESCROW_REFUND +0.00633738 = net 0), which
// correctly netted his one escrow round-trip but silently dropped the untracked
// deposit, zeroing his wallet. The two duplicate ESCROW_REFUND rows for trade
// #08ecdd97 were already correctly marked REVERSED before this script runs —
// no ledger changes needed there.
//
// Usage:
//   node scripts/fix-king888-balance.js          <- dry run (safe, no writes)
//   node scripts/fix-king888-balance.js --apply   <- write the fix

'use strict';

const path   = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);

const USER_ID       = '3c4f8383-85b4-4099-9bae-c67ed9345cd9'; // king888
const TARGET_BTC     = 0.009968;
const SWEEP_TX_HASH  = '56e3264e78f13f050368afb7222e60d1cf17037da9731bdda9a946ad8d04341d';
const DEPOSIT_TS     = '2026-08-17T17:26:52.413Z'; // matches the SWEEP row's timestamp

const DRY_RUN = !process.argv.includes('--apply');

function fmt(n) { return parseFloat(n || 0).toFixed(8); }

async function main() {
  console.log(`\n=== king888 balance repair — ${DRY_RUN ? 'DRY RUN' : 'APPLY'} ===\n`);

  const { data: wallet, error: wErr } = await db.from('wallets').select('*').eq('user_id', USER_ID).maybeSingle();
  if (wErr || !wallet) { console.error('Could not load wallets row:', wErr?.message); process.exit(1); }

  const { data: ub, error: ubErr } = await db.from('user_balances').select('*').eq('user_id', USER_ID).maybeSingle();
  if (ubErr) { console.error('Could not load user_balances row:', ubErr.message); process.exit(1); }

  // ── Safety guards — refuse to run if state has drifted from what we investigated ──
  const existingLocked = parseFloat(wallet.locked_balance_btc || 0);
  if (existingLocked !== 0) {
    console.error(`ABORT: locked_balance_btc is ${fmt(existingLocked)}, expected 0 — state has changed, re-investigate before running.`);
    process.exit(1);
  }
  const currentWalletBtc = parseFloat(wallet.balance_btc || 0);
  if (currentWalletBtc >= TARGET_BTC) {
    console.error(`ABORT: wallets.balance_btc is already ${fmt(currentWalletBtc)} (>= target ${fmt(TARGET_BTC)}) — someone else may have already fixed this. Not applying.`);
    process.exit(1);
  }

  console.log('Current state:');
  console.log(`  wallets.balance_btc       = ${fmt(wallet.balance_btc)}`);
  console.log(`  user_balances.balance_btc = ${fmt(ub?.balance_btc)}`);
  console.log('\nTarget state:');
  console.log(`  wallets.balance_btc       = ${fmt(TARGET_BTC)}`);
  console.log(`  user_balances.balance_btc = ${fmt(TARGET_BTC)}`);
  console.log(`\nWill insert a retroactive DEPOSIT ledger row (${fmt(TARGET_BTC)} BTC, tx=${SWEEP_TX_HASH}, dated ${DEPOSIT_TS})`);
  console.log('Will insert a balance_audit correction entry.');
  console.log('Will notify the user.');

  if (DRY_RUN) {
    console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
    return;
  }

  // ── 1. wallets — optimistic lock on the exact balance we investigated ──────
  const { error: walletUpdErr } = await db
    .from('wallets')
    .update({ balance_btc: TARGET_BTC, updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID)
    .eq('balance_btc', currentWalletBtc);
  if (walletUpdErr) { console.error('FAILED wallets update:', walletUpdErr.message); process.exit(1); }
  console.log(`✅ wallets.balance_btc -> ${fmt(TARGET_BTC)}`);

  // ── 2. user_balances — sync to match ────────────────────────────────────────
  const { error: ubUpdErr } = await db
    .from('user_balances')
    .update({ balance_btc: TARGET_BTC, updated_at: new Date().toISOString() })
    .eq('user_id', USER_ID);
  if (ubUpdErr) { console.error('FAILED user_balances update:', ubUpdErr.message); process.exit(1); }
  console.log(`✅ user_balances.balance_btc -> ${fmt(TARGET_BTC)}`);

  // ── 3. retroactive DEPOSIT ledger row, so the ledger reflects real history ──
  const { error: txErr } = await db.from('wallet_transactions').insert({
    user_id:    USER_ID,
    type:       'DEPOSIT',
    amount_btc: TARGET_BTC,
    status:     'CONFIRMED',
    tx_hash:    SWEEP_TX_HASH,
    currency:   'BTC',
    notes:      'Retroactive DEPOSIT entry — on-chain deposit was swept to hot wallet but never logged as a DEPOSIT (balance repair 2026-08-18)',
    created_at: DEPOSIT_TS,
  });
  if (txErr) console.error('⚠️  wallet_transactions insert failed (non-fatal, balances already fixed):', txErr.message);
  else console.log('✅ retroactive DEPOSIT row inserted');

  // ── 4. audit trail ───────────────────────────────────────────────────────────
  await db.from('balance_audit').insert({
    user_id:     USER_ID,
    change_btc:  parseFloat((TARGET_BTC - currentWalletBtc).toFixed(8)),
    new_balance: TARGET_BTC,
    reason:      'MANUAL_CORRECTION_DEPOSIT_RESTORE',
    created_at:  new Date().toISOString(),
  }).then(null, e => console.warn('balance_audit insert failed (non-fatal):', e.message));

  // ── 5. notify user ───────────────────────────────────────────────────────────
  await db.from('notifications').insert({
    user_id:    USER_ID,
    type:       'wallet',
    title:      '₿ Balance Corrected',
    message:    `We found and restored your BTC deposit — your available balance is now ₿${fmt(TARGET_BTC)}.`,
    action:     '/wallet',
    is_read:    false,
    created_at: new Date().toISOString(),
  }).then(null, e => console.warn('notification insert failed (non-fatal):', e.message));

  console.log(`\n✅ Done. king888 balance restored to ${fmt(TARGET_BTC)} BTC.`);
}

main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
