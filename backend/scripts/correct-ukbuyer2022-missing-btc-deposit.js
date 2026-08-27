// ONE-OFF CORRECTION — ukbuyer2022, missing BTC deposit credit.
//
// Facts (established via read-only investigation this session):
//   - On-chain deposit tx c22d36bd0c36b655baf62cc9c4bfdb53a83daf3d1dfce82867384ed2d163e5c0
//     landed 0.00507555 BTC at bc1qjhd9j2qw4n6es484vz7z5sjccrp75nugc206ax on 2026-08-26T17:24:54Z.
//   - Never credited — no DEPOSIT-type wallet_transactions row references this tx hash.
//   - A later withdrawal (0.00015038 BTC) drew its input from this same address, spending
//     part of this uncredited deposit. Change (0.00491317 BTC) returned to the same address.
//   - We credit ONLY the 0.00491317 BTC still actually present — crediting the original
//     0.00507555 would overcredit, since part of it already left externally.
//
// SAFETY DESIGN — mirrors praqen_credit_deposit's own ordering (ledger insert as the
// idempotency gate, before any balance mutation) and this codebase's own established
// one-off-script convention (dry-run by default, --apply required for a real write):
//   1. Idempotency check — refuses to run if this tx hash is already credited.
//   2. Fresh on-chain re-verification — refuses to run if the address's current balance
//      doesn't match what we expect (something changed since the investigation; needs a
//      fresh look, not a stale credit).
//   3. wallet_transactions DEPOSIT row inserted FIRST (idempotency gate) — if this fails,
//      nothing else has changed yet.
//   4. wallets.balance_btc credited via optimistic lock (same pattern used everywhere
//      else this session — .eq('balance_btc', valueJustRead)).
//   5. user_wallets.last_onchain_btc set to the fresh on-chain balance from step 2, so
//      this doesn't get flagged as a "new" deposit again by the real monitor later.
//   6. balance_audit stamped, so the swap-safety check doesn't misfire on this account.
//
// On ANY failure after step 3, this script STOPS and prints exactly what completed and
// what didn't — it does not attempt an automatic reversal. A partially-applied one-off
// correction needs a human to look at it, not another automated guess.
//
// USAGE:
//   node scripts/correct-ukbuyer2022-missing-btc-deposit.js            (dry run — default, no writes)
//   node scripts/correct-ukbuyer2022-missing-btc-deposit.js --apply    (real write — only after review)

require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const APPLY = process.argv.includes('--apply');

const USER_ID   = '19563f83-e4dd-468e-8bfe-47220cc23bb0'; // ukbuyer2022
const TX_HASH   = 'c22d36bd0c36b655baf62cc9c4bfdb53a83daf3d1dfce82867384ed2d163e5c0';
const ADDRESS   = 'bc1qjhd9j2qw4n6es484vz7z5sjccrp75nugc206ax';
const AMOUNT_BTC = 0.00491317; // remaining, NOT the original 0.00507555 — see header
const EXPECTED_ONCHAIN_TOLERANCE = 0.00000001; // 1 sat

async function main() {
  console.log(`Mode: ${APPLY ? '*** APPLY (will write) ***' : 'DRY RUN (no writes)'}\n`);

  // ── Step 1: Idempotency check ──────────────────────────────────────────
  const { data: existing, error: existErr } = await supa
    .from('wallet_transactions')
    .select('id, created_at, amount_btc, status')
    .eq('user_id', USER_ID)
    .eq('tx_hash', TX_HASH);
  if (existErr) { console.error('Idempotency check failed:', existErr.message); process.exit(1); }
  if (existing && existing.length > 0) {
    console.log('ABORT: this tx hash is already recorded — refusing to credit again.');
    console.log(existing);
    process.exit(1);
  }
  console.log('Step 1 OK: no existing wallet_transactions row for this tx hash.');

  // ── Step 2: Fresh on-chain re-verification ─────────────────────────────
  let onchainBtc;
  try {
    const { data: full } = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${ADDRESS}/full?limit=10`, { timeout: 15000 });
    onchainBtc = parseFloat((full.balance / 1e8).toFixed(8));
  } catch (e) {
    console.error('On-chain re-verification failed:', e.response?.status || '', e.message);
    console.error('ABORT: cannot proceed without a fresh on-chain read.');
    process.exit(1);
  }
  console.log(`Step 2: fresh on-chain balance at ${ADDRESS} = ₿${onchainBtc}`);
  if (Math.abs(onchainBtc - AMOUNT_BTC) > EXPECTED_ONCHAIN_TOLERANCE) {
    console.error(`ABORT: on-chain balance (₿${onchainBtc}) no longer matches the expected ₿${AMOUNT_BTC}.`);
    console.error('Something changed since the investigation (new deposit, sweep, another withdrawal) —');
    console.error('this needs a fresh look, not a credit based on stale numbers.');
    process.exit(1);
  }
  console.log('Step 2 OK: on-chain balance matches expected amount.');

  // ── Read current wallets row (for the optimistic lock + balance_audit) ──
  const { data: wal, error: walErr } = await supa.from('wallets').select('balance_btc').eq('user_id', USER_ID).maybeSingle();
  if (walErr || !wal) { console.error('Could not read current wallets row:', walErr?.message || 'not found'); process.exit(1); }
  const currentBalance = parseFloat(wal.balance_btc || 0);
  const newBalance = parseFloat((currentBalance + AMOUNT_BTC).toFixed(8));
  console.log(`Current wallets.balance_btc = ${currentBalance} -> would become ${newBalance}`);

  const idempotencyKey = `MANUAL_CORRECTION:${TX_HASH}`;
  const nowIso = new Date().toISOString();
  const note = `Manual correction: on-chain deposit ${TX_HASH} (0.00507555 BTC original) was never credited — ` +
    `part of it (0.00015038 BTC) was already spent by a subsequent withdrawal before this was caught. ` +
    `Crediting only the remaining ₿${AMOUNT_BTC} still present at the deposit address, not the original amount.`;

  console.log('\n--- Planned writes ---');
  console.log('1. INSERT wallet_transactions:', { user_id: USER_ID, type: 'DEPOSIT', currency: 'BTC', amount_btc: AMOUNT_BTC, status: 'CONFIRMED', tx_hash: TX_HASH, idempotency_key: idempotencyKey, notes: note });
  console.log('2. UPDATE wallets:', { user_id: USER_ID, balance_btc: `${currentBalance} -> ${newBalance}` });
  console.log('3. UPDATE user_wallets.last_onchain_btc ->', onchainBtc);
  console.log('4. INSERT balance_audit:', { user_id: USER_ID, change_btc: AMOUNT_BTC, new_balance: newBalance, reason: 'DEPOSIT' });

  if (!APPLY) {
    console.log('\nDry run complete — nothing was written. Re-run with --apply to execute.');
    return;
  }

  // ── Step 3: Ledger row FIRST (idempotency gate) ────────────────────────
  const { error: txErr } = await supa.from('wallet_transactions').insert({
    user_id: USER_ID, type: 'DEPOSIT', currency: 'BTC', amount_btc: AMOUNT_BTC, amount_usdt: 0,
    status: 'CONFIRMED', tx_hash: TX_HASH, idempotency_key: idempotencyKey, notes: note, created_at: nowIso,
  });
  if (txErr) {
    console.error('🚨 STEP 3 FAILED — wallet_transactions insert error:', txErr.message);
    console.error('Nothing else was written. Safe to investigate and retry.');
    process.exit(1);
  }
  console.log('Step 3 done: wallet_transactions DEPOSIT row inserted.');

  // ── Step 4: Credit wallets.balance_btc via optimistic lock ─────────────
  const { data: updRows, error: updErr } = await supa.from('wallets')
    .update({ balance_btc: newBalance, updated_at: nowIso })
    .eq('user_id', USER_ID)
    .eq('balance_btc', currentBalance)
    .select('balance_btc');
  if (updErr || !updRows || updRows.length === 0) {
    console.error('🚨🚨 STEP 4 FAILED — balance NOT credited, but the ledger row from step 3 EXISTS.');
    console.error('This account now has a DEPOSIT ledger entry with no matching balance credit —');
    console.error('needs immediate manual follow-up. Error:', updErr?.message || 'balance changed concurrently (0 rows matched)');
    process.exit(1);
  }
  console.log(`Step 4 done: wallets.balance_btc credited -> ${updRows[0].balance_btc}`);

  // ── Step 5: Advance the checkpoint ──────────────────────────────────────
  const { error: uwErr } = await supa.from('user_wallets')
    .update({ last_onchain_btc: onchainBtc, updated_at: nowIso })
    .eq('user_id', USER_ID);
  if (uwErr) {
    console.error('🚨 STEP 5 FAILED — checkpoint not advanced:', uwErr.message);
    console.error('Balance WAS credited (step 4 succeeded). This on-chain amount may be re-flagged as');
    console.error('"new" by the real monitor later unless the checkpoint is fixed manually.');
    process.exit(1);
  }
  console.log(`Step 5 done: user_wallets.last_onchain_btc -> ${onchainBtc}`);

  // ── Step 6: balance_audit stamp ─────────────────────────────────────────
  const { error: auditErr } = await supa.from('balance_audit').insert({
    user_id: USER_ID, change_btc: AMOUNT_BTC, new_balance: newBalance, reason: 'DEPOSIT', created_at: nowIso,
  });
  if (auditErr) {
    console.error('🚨 STEP 6 FAILED — balance_audit stamp missing:', auditErr.message);
    console.error('Balance WAS credited (step 4 succeeded). This account\'s next swap may be falsely');
    console.error('blocked by the ledger-safety check until this stamp is added manually.');
    process.exit(1);
  }
  console.log('Step 6 done: balance_audit stamped.');

  console.log('\n✅ Correction complete. All 4 writes applied successfully.');
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
