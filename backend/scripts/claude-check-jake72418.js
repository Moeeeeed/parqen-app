// READ-ONLY diagnostic for jake72418@gmail.com — "deposited BTC, can't see it in wallet".
// Checks: user row, wallets row, user_wallets row (deposit address), recent
// wallet_transactions, escrow_locks, and the live on-chain balance at their
// BTC address (via blockstream.info) compared against what's recorded in the DB.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const EMAIL = 'jake72418@gmail.com';

(async () => {
  const { data: user, error: userErr } = await supa
    .from('users')
    .select('id, email, username, account_status, bitcoin_wallet_address, created_at')
    .ilike('email', EMAIL)
    .maybeSingle();

  if (userErr) { console.error('User lookup error:', userErr.message); return; }
  if (!user) { console.log(`No user found with email ${EMAIL}`); return; }

  console.log('=== USER ===');
  console.log(user);

  const [{ data: wallet }, { data: uw }, { data: txs }, { data: locks }] = await Promise.all([
    supa.from('wallets').select('*').eq('user_id', user.id).maybeSingle(),
    supa.from('user_wallets').select('*').eq('user_id', user.id).maybeSingle(),
    supa.from('wallet_transactions').select('id, type, status, currency, amount_btc, amount_usdt, tx_hash, notes, created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    supa.from('escrow_locks').select('id, trade_id, amount_btc, status, seller_id').eq('seller_id', user.id),
  ]);

  console.log('\n=== wallets row ===');
  console.log(wallet);
  console.log('\n=== user_wallets row (deposit address) ===');
  console.log(uw);
  console.log('\n=== last 20 wallet_transactions ===');
  console.log(txs);
  console.log('\n=== escrow_locks ===');
  console.log(locks);

  const address = uw?.btc_address || user.bitcoin_wallet_address;
  if (!address) {
    console.log('\nNO BTC DEPOSIT ADDRESS ON FILE — this alone would explain "deposited but can\'t see it": there is nowhere for the deposit monitor to look.');
    return;
  }

  console.log(`\n=== Checking on-chain balance for ${address} (blockstream.info) ===`);
  try {
    const resp = await axios.get(`https://blockstream.info/api/address/${address}`, { timeout: 10000 });
    const cs = resp.data?.chain_stats || {};
    const mp = resp.data?.mempool_stats || {};
    const confirmedSats = (cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0);
    const mempoolSats = (mp.funded_txo_sum || 0) - (mp.spent_txo_sum || 0);
    console.log(`Confirmed on-chain balance: ${(confirmedSats / 1e8).toFixed(8)} BTC`);
    console.log(`Mempool (unconfirmed) delta: ${(mempoolSats / 1e8).toFixed(8)} BTC`);
    console.log(`DB wallets.balance_btc: ${wallet?.balance_btc ?? 'n/a'}  locked_balance_btc: ${wallet?.locked_balance_btc ?? 'n/a'}`);
    console.log(`DB user_wallets.last_onchain_btc: ${uw?.last_onchain_btc ?? 'n/a'}`);

    const txResp = await axios.get(`https://blockstream.info/api/address/${address}/txs`, { timeout: 10000 });
    console.log(`\nRecent on-chain txs at this address (${(txResp.data || []).length}):`);
    (txResp.data || []).slice(0, 10).forEach(tx => {
      const vout = (tx.vout || []).filter(o => o.scriptpubkey_address === address);
      const received = vout.reduce((s, o) => s + o.value, 0) / 1e8;
      console.log(`  txid=${tx.txid} confirmed=${tx.status.confirmed} block_time=${tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : 'unconfirmed'} received=${received} BTC`);
    });
  } catch (e) {
    console.error('blockstream.info lookup failed:', e.message);
  }
})();
