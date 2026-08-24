// Manual correction for two users whose real on-chain BTC deposits were never
// credited (DepositMonitor was being rate-limited by blockstream/mempool —
// see server_restart_out2.txt "Rate limited — will retry next cycle" spam).
// Confirmed via claude-check-two-users.js:
//   ukbuyer2022  (19563f83-e4dd-468e-8bfe-47220cc23bb0): on-chain 0.0099 BTC vs last_onchain_btc 0.00547146
//   yornnguyen   (695d7e05-999f-4264-9952-5ae6730de32a): on-chain 0.00640338 BTC vs last_onchain_btc 0
// Mirrors depositMonitor.js's claim/credit sequence (Step 5a/5b): re-reads
// live on-chain balance now (not the earlier scan snapshot), atomic claim on
// last_onchain_btc, optimistic-locked credit on wallets.balance_btc, then
// logs wallet_transactions + notification. Does NOT sweep funds to hot wallet
// — that's a separate on-chain send left for the normal sweep process.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function fetchBtcAddress(address) {
  const resp = await axios.get(`https://blockstream.info/api/address/${address}`, { timeout: 10000 });
  return resp.data;
}

async function creditUser(userId, username) {
  console.log(`\n=== ${username} (${userId}) ===`);

  const { data: uw } = await db.from('user_wallets')
    .select('btc_address, last_onchain_btc').eq('user_id', userId).maybeSingle();
  const address = uw?.btc_address;
  if (!address) { console.error('No btc_address on file — aborting for this user'); return; }

  const addrData = await fetchBtcAddress(address);
  const cs = addrData?.chain_stats || {};
  const sats = (cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0);
  const blockchainBTC = parseFloat((sats / 1e8).toFixed(8));
  const lastOnchainBTC = parseFloat(uw?.last_onchain_btc || 0);

  console.log(`  on-chain now: ${blockchainBTC} BTC | last recorded: ${lastOnchainBTC} BTC`);
  if (blockchainBTC <= lastOnchainBTC + 0.000000009) {
    console.log('  Nothing to credit (already caught up, or a concurrent process already handled it).');
    return;
  }
  const depositBTC = parseFloat((blockchainBTC - lastOnchainBTC).toFixed(8));
  console.log(`  crediting: ${depositBTC} BTC`);

  // Step 1: atomic claim on last_onchain_btc (compare-and-swap)
  const nowIso = new Date().toISOString();
  const { data: claimedRows, error: claimErr } = await db.from('user_wallets')
    .update({ last_onchain_btc: blockchainBTC, updated_at: nowIso })
    .eq('user_id', userId)
    .or(`last_onchain_btc.is.null,last_onchain_btc.lt.${blockchainBTC}`)
    .select('user_id');
  if (claimErr) { console.error('  claim UPDATE failed:', claimErr.message); return; }
  if (!claimedRows || claimedRows.length === 0) {
    console.log('  Claim did not match any row — a concurrent process (e.g. the live monitor) likely already credited this. Skipping.');
    return;
  }

  // Step 2: optimistic-locked credit on wallets.balance_btc
  const { data: wal } = await db.from('wallets').select('balance_btc').eq('user_id', userId).maybeSingle();
  const currentBalanceBTC = parseFloat(wal?.balance_btc || 0);
  const newBalanceBTC = parseFloat((currentBalanceBTC + depositBTC).toFixed(8));

  const { data: creditRows, error: creditErr } = await db.from('wallets')
    .update({ balance_btc: newBalanceBTC, updated_at: nowIso })
    .eq('user_id', userId)
    .eq('balance_btc', currentBalanceBTC)
    .select('user_id');
  if (creditErr) {
    console.error('  CREDIT FAILED — reverting claim:', creditErr.message);
    await db.from('user_wallets').update({ last_onchain_btc: lastOnchainBTC, updated_at: new Date().toISOString() }).eq('user_id', userId);
    return;
  }
  if (!creditRows || creditRows.length === 0) {
    console.log('  Lost optimistic-lock race — a concurrent process already credited this. Skipping duplicate credit.');
    return;
  }

  console.log(`  Credited. New wallets.balance_btc: ${newBalanceBTC} BTC`);

  await db.from('wallet_transactions').insert({
    user_id: userId, type: 'DEPOSIT', amount_btc: depositBTC, status: 'CONFIRMED',
    notes: `Manual correction: DepositMonitor missed this on-chain deposit to ${address.slice(0, 16)}… (rate-limited by blockstream/mempool APIs — see server_restart_out2.txt). Credited full missing amount.`,
    created_at: nowIso,
  });

  await db.from('notifications').insert({
    user_id: userId, type: 'wallet', title: '₿ Bitcoin Received!',
    message: `${depositBTC.toFixed(8)} BTC credited to your wallet. Balance: ${newBalanceBTC.toFixed(8)} BTC`,
    action: '/wallet', is_read: false, created_at: nowIso,
  });

  console.log('  wallet_transactions + notification recorded.');
}

(async () => {
  await creditUser('19563f83-e4dd-468e-8bfe-47220cc23bb0', 'ukbuyer2022');
  await creditUser('695d7e05-999f-4264-9952-5ae6730de32a', 'yornnguyen');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
