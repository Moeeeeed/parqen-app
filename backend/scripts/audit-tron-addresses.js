// One-shot audit: verify every user's Tron/USDT deposit address is present,
// valid, correctly derived, and not duplicated across users.
// Read-only — makes no writes. Run with: node scripts/audit-tron-addresses.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function run() {
  const { data: users } = await supabase.from('users').select('id, username, email');
  const { data: uwRows } = await supabase.from('user_wallets').select('user_id, tron_address, last_onchain_usdt');

  const uwByUser = new Map(uwRows.map(r => [r.user_id, r]));
  const addressToUsers = new Map(); // address -> [userId,...]

  const missingRow = [];
  const missingAddress = [];
  const invalidFormat = [];
  const mismatchedDerivation = [];
  const ok = [];

  for (const u of users) {
    const uw = uwByUser.get(u.id);
    if (!uw) { missingRow.push(u); continue; }
    if (!uw.tron_address) { missingAddress.push(u); continue; }

    if (!tronWallet.isValidTronAddress(uw.tron_address)) {
      invalidFormat.push({ user: u, address: uw.tron_address });
      continue;
    }

    const expected = tronWallet.generateAddress(`user_${u.id}`).address;
    if (expected !== uw.tron_address) {
      mismatchedDerivation.push({ user: u, onFile: uw.tron_address, expected });
      continue;
    }

    if (!addressToUsers.has(uw.tron_address)) addressToUsers.set(uw.tron_address, []);
    addressToUsers.get(uw.tron_address).push(u.id);

    ok.push(u);
  }

  const duplicates = [...addressToUsers.entries()].filter(([, ids]) => ids.length > 1);

  console.log(`\n=== TRON ADDRESS AUDIT ===`);
  console.log(`Total users              : ${users.length}`);
  console.log(`OK (present, valid, matches derivation): ${ok.length}`);
  console.log(`Missing user_wallets row : ${missingRow.length}`);
  console.log(`Missing tron_address     : ${missingAddress.length}`);
  console.log(`Invalid address format   : ${invalidFormat.length}`);
  console.log(`Mismatched derivation    : ${mismatchedDerivation.length}`);
  console.log(`Duplicate addresses      : ${duplicates.length}`);

  if (missingRow.length) {
    console.log(`\n-- Missing user_wallets row --`);
    missingRow.forEach(u => console.log(`  ${u.username} (${u.id})`));
  }
  if (missingAddress.length) {
    console.log(`\n-- Missing tron_address --`);
    missingAddress.forEach(u => console.log(`  ${u.username} (${u.id})`));
  }
  if (invalidFormat.length) {
    console.log(`\n-- Invalid address format --`);
    invalidFormat.forEach(x => console.log(`  ${x.user.username}: ${x.address}`));
  }
  if (mismatchedDerivation.length) {
    console.log(`\n-- MISMATCHED DERIVATION (serious — funds sent here may be unrecoverable) --`);
    mismatchedDerivation.forEach(x => console.log(`  ${x.user.username} (${x.user.id}): on file=${x.onFile} expected=${x.expected}`));
  }
  if (duplicates.length) {
    console.log(`\n-- DUPLICATE ADDRESSES (critical — deposit misattribution risk) --`);
    duplicates.forEach(([addr, ids]) => console.log(`  ${addr}: ${ids.join(', ')}`));
  }

  console.log(`\nDone.`);

  // Dump the OK list with addresses for the next-step balance sweep.
  require('fs').writeFileSync(
    require('path').join(__dirname, 'audit-ok-addresses.json'),
    JSON.stringify(ok.map(u => ({ id: u.id, username: u.username, tron_address: uwByUser.get(u.id).tron_address, last_onchain_usdt: uwByUser.get(u.id).last_onchain_usdt })), null, 2)
  );
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
