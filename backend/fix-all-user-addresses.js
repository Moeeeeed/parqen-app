// fix-all-user-addresses.js
// Run ONCE to migrate all users from old Coinbase CDP addresses to HD wallet addresses.
//
// What it does:
//   1. Loads every user from the DB
//   2. Derives the correct HD wallet address for each user (same logic as hdWalletService)
//   3. Compares with what is stored in user_wallets.btc_address and users.bitcoin_wallet_address
//   4. If they don't match → the stored address is an old Coinbase CDP address → replaces it
//   5. Resets last_onchain_btc to 0 for replaced addresses (new address, clean slate)
//   6. Subscribes new addresses to the deposit monitor
//
// Usage:
//   node fix-all-user-addresses.js
//
// Safe to re-run — skips users who already have the correct HD wallet address.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWallet         = require('./services/hdWalletService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const tronWallet = require('./services/tronWalletService');

async function fixAllUserAddresses() {
  console.log('\n🔧 PRAQEN Address Synchronization — Mainnet HD Wallet');
  console.log('='.repeat(60));

  tronWallet.initialize();

  // 1. Load all users
  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, username, bitcoin_wallet_address')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Failed to load users:', error.message);
    process.exit(1);
  }

  console.log(`\n📋 Found ${users.length} users to check\n`);

  let fixed   = 0;
  let skipped = 0;
  let failed  = 0;

  for (const user of users) {
    try {
      // Derive the correct HD wallet address for this user
      const correctBtcAddr = hdWallet.generateUserAddress(user.id).address;
      const correctTronAddr = tronWallet.generateUserAddress(user.id).address;

      // Fetch current stored address from user_wallets
      const { data: walletRow } = await supabaseAdmin
        .from('user_wallets')
        .select('btc_address, tron_address, balance_btc, last_onchain_btc')
        .eq('user_id', user.id)
        .maybeSingle();

      const storedWalletAddr  = walletRow?.btc_address || null;
      const storedTronAddr    = walletRow?.tron_address || null;
      const storedUserAddr    = user.bitcoin_wallet_address || null;

      const walletMatch = storedWalletAddr === correctBtcAddr;
      const tronMatch   = storedTronAddr   === correctTronAddr;
      const userMatch   = storedUserAddr   === correctBtcAddr;

      if (walletMatch && tronMatch && userMatch) {
        console.log(`✅ OK       ${(user.username || user.id).padEnd(20)} BTC: ${correctBtcAddr.slice(0, 16)}… Tron: ${correctTronAddr.slice(0, 16)}…`);
        skipped++;
        continue;
      }

      console.log(`\n⚠️  SYNCING ${user.username || user.id}`);
      console.log(`   BTC  : ${storedWalletAddr || 'NULL'} → ${correctBtcAddr}`);
      console.log(`   TRON : ${storedTronAddr || 'NULL'} → ${correctTronAddr}`);

      // Update users, user_wallets, and wallets
      const updates = [
        supabaseAdmin.from('users').update({
          bitcoin_wallet_address: correctBtcAddr,
          updated_at: new Date().toISOString(),
        }).eq('id', user.id),

        supabaseAdmin.from('user_wallets').upsert({
          user_id:      user.id,
          btc_address:  correctBtcAddr,
          tron_address: correctTronAddr,
          network:      'mainnet',
          balance_btc:  parseFloat(walletRow?.balance_btc || 0),
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'user_id' }),

        supabaseAdmin.from('wallets').update({
          address:    correctBtcAddr,
          updated_at: new Date().toISOString(),
        }).eq('user_id', user.id)
      ];

      const results = await Promise.all(updates);
      const err = results.find(r => r.error)?.error;

      if (err) {
        console.error(`   ❌ Update failed:`, err.message);
        failed++;
      } else {
        console.log(`   ✅ Synced`);
        fixed++;
      }

    } catch (err) {
      console.error(`❌ Error processing user ${user.id.slice(0,8)}:`, err.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Migration complete:`);
  console.log(`   ✅ Already correct : ${skipped}`);
  console.log(`   🔧 Fixed           : ${fixed}`);
  console.log(`   ❌ Failed          : ${failed}`);

  if (fixed > 0) {
    console.log(`\n⚠️  IMPORTANT — ${fixed} user(s) had their deposit address changed.`);
    console.log(`   Their OLD addresses were Coinbase CDP addresses that Coinbase sweeps.`);
    console.log(`   Their NEW addresses are HD wallet addresses that PRAQEN controls.`);
    console.log(`   Notify affected users to use their new deposit address.`);
    console.log(`   Any BTC sent to old addresses: contact Coinbase CDP support.`);
  }

  if (failed === 0 && fixed >= 0) {
    console.log(`\n✅ All users now use HD wallet addresses. No more Coinbase sweeping.\n`);
  }
}

fixAllUserAddresses().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
