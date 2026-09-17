// scripts/manual-credit-deposit.js
// ─────────────────────────────────────────────────────────────────────────────
// Reviewed, reusable tool for crediting a confirmed on-chain deposit the
// monitors haven't picked up yet (backend was down, a stall, etc).
//
// WHY this exists: on 2026-09-14, two manual fixes (ukbuyer2022 BTC, yornnguyen
// USDT) were applied as direct balance edits with no matching deposit_tracking_v2
// row. That left both addresses permanently sweep-gated (sweepService checks
// deposit_tracking_v2.credited per-UTXO/per-txid, not the wallet balance) and
// exposed both txids to being auto-detected and credited a SECOND time later,
// since the pipeline had no record either was ever handled.
//
// This script always does exactly what the live monitors do for a normal
// deposit — nothing more, nothing improvised:
//   1. Insert the deposit_tracking_v2 row FIRST (credited: false) — the same
//      claim-then-act idempotency gate depositMonitor.js / usdtDepositMonitor.js use.
//   2. Credit via the same atomic praqen_credit_deposit RPC (idempotency-keyed
//      on `${currency}:${userId}:${txHash}`, exactly like the monitors).
//   3. Mark the row credited: true.
//   4. Trigger the same immediate sweep the monitors fire after a credit
//      (sweepService.sweepUser for BTC, tronHotWallet.sweepFromUserAddress for
//      USDT) — so the fix is sweep-eligible immediately instead of waiting on
//      the next periodic scan.
//
// Safe by default: DRY_RUN unless you explicitly set DRY_RUN=false.
//
//   node scripts/manual-credit-deposit.js            # dry run — prints what it would do
//   DRY_RUN=false node scripts/manual-credit-deposit.js   # actually credits + sweeps
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

// ── Edit this list, then run. One entry per deposit to credit. ────────────────
const TARGETS = [
  // {
  //   username: 'slime_yung',
  //   userId:   '496f44a9-ff54-47ee-a8ce-7effa8580691',
  //   currency: 'BTC',                                            // 'BTC' | 'USDT'
  //   address:  'bc1qk07lhx5074jecgypmw8q2lc6fktpyzh0ke4dxf',
  //   txHash:   '58029a9fd89420225c42f65cd77aa8842fca6763766fdaf224402b665e0ddb5f',
  //   amount:   0.00025761,
  // },
];

const DRY_RUN = process.env.DRY_RUN !== 'false'; // default true — must opt in to write

async function creditOne(t) {
  const label = `${t.username} | ${t.currency} ${t.amount} | tx ${t.txHash.slice(0, 12)}…`;

  // Pre-check: already tracked? (the insert below would also catch this via the
  // unique (tx_hash, address) constraint, but checking first gives a clearer message)
  const { data: existing } = await db.from('deposit_tracking_v2')
    .select('id, credited').eq('tx_hash', t.txHash).eq('address', t.address).maybeSingle();
  if (existing) {
    console.log(`[SKIP] ${label} — already tracked (credited=${existing.credited}). Nothing to do.`);
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would credit ${label} — insert deposit_tracking_v2, call praqen_credit_deposit, mark credited, trigger sweep.`);
    return;
  }

  // Step 1 — claim the txid before crediting (same order the monitors use)
  const { error: insErr } = await db.from('deposit_tracking_v2').insert({
    tx_hash: t.txHash, address: t.address, user_id: t.userId, currency: t.currency,
    amount: t.amount, credited: false, detected_by: 'manual_credit',
  });
  if (insErr) {
    if (/duplicate|unique/i.test(insErr.message || '')) {
      console.log(`[SKIP] ${label} — claimed concurrently, skipping.`);
      return;
    }
    console.error(`[ABORT] ${label} — could not record tracking row:`, insErr.message);
    return;
  }

  // Step 2 — the exact same atomic RPC the live monitors use
  const idempotencyKey = `${t.currency}:${t.userId}:${t.txHash}`;
  let newBalance;
  try {
    const { data: rpcBalance, error: creditErr } = await db.rpc('praqen_credit_deposit', {
      p_user_id:         t.userId,
      p_currency:        t.currency,
      p_amount:          t.amount,
      p_onchain_balance: t.amount,
      p_idempotency_key: idempotencyKey,
      p_note:            `Manual credit for on-chain deposit ${t.txHash.slice(0, 16)}… to ${t.address.slice(0, 16)}… (manual-credit-deposit.js, ${new Date().toISOString().slice(0, 10)})`,
    });
    if (creditErr) throw creditErr;
    newBalance = parseFloat(rpcBalance);
  } catch (creditErr) {
    if (/duplicate|unique/i.test(creditErr.message || '') || /idempotency_key/i.test(creditErr.message || '')) {
      console.log(`[INFO] ${label} — already credited under this idempotency key. Marking tracked row credited.`);
      await db.from('deposit_tracking_v2').update({ credited: true, credited_at: new Date().toISOString() })
        .eq('tx_hash', t.txHash).eq('address', t.address);
    } else {
      console.error(`[FAILED] ${label} — praqen_credit_deposit error:`, creditErr.message);
      await db.from('deposit_tracking_v2').update({ credit_error: creditErr.message })
        .eq('tx_hash', t.txHash).eq('address', t.address);
      return; // leave credited:false so a future automated pass can retry safely
    }
  }

  if (newBalance !== undefined) {
    await db.from('deposit_tracking_v2').update({ credited: true, credited_at: new Date().toISOString() })
      .eq('tx_hash', t.txHash).eq('address', t.address);
    console.log(`[OK] ${label} — credited. New balance: ${newBalance}`);
  }

  // Step 3 — trigger the same immediate sweep a normal credit fires
  try {
    if (t.currency === 'BTC') {
      const sweepService = require('../services/sweepService');
      await sweepService.sweepUser(t.userId);
      console.log(`[OK] ${label} — sweep triggered.`);
    } else if (t.currency === 'USDT') {
      const tronHotWallet = require('../services/tronHotWallet');
      await tronHotWallet.sweepFromUserAddress(t.userId, t.address, t.amount);
      console.log(`[OK] ${label} — sweep triggered.`);
    }
  } catch (sweepErr) {
    console.warn(`[WARN] ${label} — sweep trigger failed (non-fatal, next periodic sweep cycle will retry):`, sweepErr.message);
  }
}

(async () => {
  if (TARGETS.length === 0) {
    console.log('No TARGETS configured — edit the list at the top of this script, then run again.');
    return;
  }
  console.log(`manual-credit-deposit.js — ${DRY_RUN ? 'DRY RUN (set DRY_RUN=false to actually write)' : 'LIVE — will write'}\n`);
  for (const t of TARGETS) await creditOne(t);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e); process.exit(1); });
