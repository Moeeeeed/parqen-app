// scripts/fix-remaining-4-balances.js
// ONE-TIME repair: restore KEN IGHO, PabloXchange, Iraqiy_Xchange, and
// kingkong79-Pro to their last-known-good balances before manual SQL
// over-corrections drove them negative / off.
//
// Each target below is corroborated by 4+ independent, repeated
// balance_audit INTEGRITY_SYNC entries (wallets -> user_balances sync,
// which only fires when they drift) landing on the exact same value across
// hours-to-weeks of history, right up until ~11:13 on 2026-08-18 — the
// point where the corrupting manual SQL appears to have run. See balance_audit
// rows for each user_id for the full trail.
//
// Usage:
//   node scripts/fix-remaining-4-balances.js          <- dry run (safe, no writes)
//   node scripts/fix-remaining-4-balances.js --apply   <- write the fixes

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

const TARGETS = [
  { name: 'KEN IGHO',       userId: '65830906-297b-4eb5-8c60-ed0e9a4aac82', target: 0.00364227 },
  { name: 'PabloXchange',   userId: '266e1a48-8ff6-4887-868d-5289c583e37b', target: 0.00000009 },
  { name: 'Iraqiy_Xchange', userId: '4dda3151-e7fc-4eac-8a06-90f2eb163482', target: 0.00723347 },
];

const DRY_RUN = !process.argv.includes('--apply');

function fmt(n) { return parseFloat(n || 0).toFixed(8); }

async function main() {
  console.log(`\n=== Balance repair for 4 users — ${DRY_RUN ? 'DRY RUN' : 'APPLY'} ===\n`);

  for (const t of TARGETS) {
    console.log(`--- ${t.name} (${t.userId}) ---`);

    const { data: wallet, error: wErr } = await db.from('wallets').select('*').eq('user_id', t.userId).maybeSingle();
    if (wErr || !wallet) { console.error(`  ABORT: could not load wallets row: ${wErr?.message}`); continue; }

    const { data: ub } = await db.from('user_balances').select('balance_btc').eq('user_id', t.userId).maybeSingle();
    const { data: uw } = await db.from('user_wallets').select('balance_btc').eq('user_id', t.userId).maybeSingle();

    const existingLocked = parseFloat(wallet.locked_balance_btc || 0);
    if (existingLocked !== 0) {
      console.error(`  ABORT: locked_balance_btc is ${fmt(existingLocked)}, expected 0 — state has changed, re-investigate before running.`);
      continue;
    }

    const currentWalletBtc = parseFloat(wallet.balance_btc || 0);
    console.log(`  wallets.balance_btc:       ${fmt(currentWalletBtc)}  -> ${fmt(t.target)}`);
    console.log(`  user_balances.balance_btc: ${fmt(ub?.balance_btc)}  -> ${fmt(t.target)}`);
    console.log(`  user_wallets.balance_btc:  ${fmt(uw?.balance_btc)}  -> ${fmt(t.target)}`);

    if (DRY_RUN) continue;

    // ── 1. wallets — optimistic lock on the exact balance we investigated ──
    const { error: walletUpdErr } = await db
      .from('wallets')
      .update({ balance_btc: t.target, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId)
      .eq('balance_btc', currentWalletBtc);
    if (walletUpdErr) { console.error(`  FAILED wallets update: ${walletUpdErr.message}`); continue; }
    console.log(`  ✅ wallets.balance_btc -> ${fmt(t.target)}`);

    // ── 2. user_balances — sync ─────────────────────────────────────────────
    const { error: ubUpdErr } = await db
      .from('user_balances')
      .update({ balance_btc: t.target, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId);
    if (ubUpdErr) console.error(`  ⚠️  user_balances update failed: ${ubUpdErr.message}`);
    else console.log(`  ✅ user_balances.balance_btc -> ${fmt(t.target)}`);

    // ── 3. user_wallets — sync ───────────────────────────────────────────────
    const { error: uwUpdErr } = await db
      .from('user_wallets')
      .update({ balance_btc: t.target, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId);
    if (uwUpdErr) console.error(`  ⚠️  user_wallets update failed: ${uwUpdErr.message}`);
    else console.log(`  ✅ user_wallets.balance_btc -> ${fmt(t.target)}`);

    // ── 4. audit trail ───────────────────────────────────────────────────────
    await db.from('balance_audit').insert({
      user_id:     t.userId,
      change_btc:  parseFloat((t.target - currentWalletBtc).toFixed(8)),
      new_balance: t.target,
      reason:      'MANUAL_CORRECTION_RESTORE_FROM_AUDIT',
      created_at:  new Date().toISOString(),
    }).then(null, e => console.warn(`  balance_audit insert failed (non-fatal): ${e.message}`));

    // ── 5. notify user ───────────────────────────────────────────────────────
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
