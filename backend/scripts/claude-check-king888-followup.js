// READ-ONLY follow-up to claude-check-king888.js — fixes: (1) wallet_transactions
// query without the nonexistent idempotency_key column, (2) BTC on-chain check
// with retry/backoff for BOTH candidate BTC addresses, (3) check whether the
// 200 locked USDT is a legitimate active trade/escrow rather than a sync bug.
// Every query is SELECT-only; the on-chain checks are read-only blockchain
// lookups. No writes, no RPC calls, nothing that could credit anyone.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USER_ID = '3c4f8383-85b4-4099-9bae-c67ed9345cd9';
const WALLETS_BTC_ADDRESS = 'bc1q2f5b6f4f5cba137d78282e4ed16b8352b294ab6e';
const USER_WALLETS_BTC_ADDRESS = 'bc1qnqwv9jt53suwzmrl8px2qphwt0vp2cqe04uxjw';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchBtcAddressWithRetry(address, label) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const resp = await axios.get(`https://blockstream.info/api/address/${address}`, { timeout: 10000 });
      return resp.data;
    } catch (e) {
      const status = e.response?.status;
      if (status === 429 && attempt < 4) {
        const wait = 4000 * (attempt + 1);
        console.log(`  [${label}] rate limited, retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
}

(async () => {
  console.log('=== 1. wallet_transactions, corrected query (no idempotency_key column) ===');
  const { data: txs, error: txErr } = await supa
    .from('wallet_transactions')
    .select('id, type, currency, amount_btc, amount_usdt, status, tx_hash, destination_address, notes, created_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(40);
  console.log('error:', txErr?.message || 'none', '| count:', (txs || []).length);
  (txs || []).forEach(t => console.log(`  - ${t.created_at} | ${t.type} | ${t.currency} | amt_btc=${t.amount_btc} amt_usdt=${t.amount_usdt} | status=${t.status} | tx_hash=${t.tx_hash || '(none)'} | notes=${t.notes || ''}`));
  const deposits = (txs || []).filter(t => t.type === 'DEPOSIT');
  console.log(`\n  DEPOSIT-type rows: ${deposits.length}`);
  deposits.forEach(t => console.log('   ', JSON.stringify(t)));

  console.log('\n=== 2. What is holding the 200 locked_balance_usdt? ===');
  const { data: activeTrades } = await supa.from('trades')
    .select('id, status, trade_type, amount_usd, amount_btc, buyer_id, seller_id, gift_card_brand, payment_method, created_at')
    .or(`buyer_id.eq.${USER_ID},seller_id.eq.${USER_ID}`)
    .in('status', ['CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED'])
    .order('created_at', { ascending: false });
  console.log(`  Open trades (buyer or seller) involving this user: ${(activeTrades || []).length}`);
  (activeTrades || []).forEach(t => console.log('   ', JSON.stringify(t)));

  const { data: escrowLocks } = await supa.from('escrow_locks')
    .select('id, trade_id, seller_id, status, amount_usdt, amount_btc, currency, created_at')
    .eq('seller_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(`  escrow_locks rows for this user as seller: ${(escrowLocks || []).length}`);
  (escrowLocks || []).forEach(e => console.log('   ', JSON.stringify(e)));

  const { data: sellerDeposits } = await supa.from('seller_deposits')
    .select('id, status, amount_usdt, created_at, updated_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(`  seller_deposits rows for this user: ${(sellerDeposits || []).length}`);
  (sellerDeposits || []).forEach(s => console.log('   ', JSON.stringify(s)));

  console.log('\n=== 3. BTC on-chain check, both candidate addresses, with retry ===');
  for (const [label, addr] of [['wallets.address', WALLETS_BTC_ADDRESS], ['user_wallets.btc_address', USER_WALLETS_BTC_ADDRESS]]) {
    try {
      const addrData = await fetchBtcAddressWithRetry(addr, label);
      const chainStats = addrData?.chain_stats || {};
      const mempoolStats = addrData?.mempool_stats || {};
      const confirmedSats = (chainStats.funded_txo_sum || 0) - (chainStats.spent_txo_sum || 0);
      const unconfirmedSats = (mempoolStats.funded_txo_sum || 0) - (mempoolStats.spent_txo_sum || 0);
      console.log(`  [${label}] ${addr}`);
      console.log(`    confirmed on-chain balance: ₿${(confirmedSats / 1e8).toFixed(8)}`);
      console.log(`    unconfirmed (mempool) balance: ₿${(unconfirmedSats / 1e8).toFixed(8)}`);
      console.log(`    total funded txs: ${chainStats.funded_txo_count || 0} | total spent txs: ${chainStats.spent_txo_count || 0}`);

      await sleep(2000);
      const txsResp = await fetchBtcAddressTxs(addr);
      console.log(`    recent txs at this address (${(txsResp || []).length} total, showing up to 5):`);
      (txsResp || []).slice(0, 5).forEach(tx => {
        const received = (tx.vout || []).filter(o => o.scriptpubkey_address === addr).reduce((s, o) => s + o.value, 0) / 1e8;
        console.log(`      - txid=${tx.txid} | confirmed=${tx.status?.confirmed} | block_time=${tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : 'unconfirmed'} | received=₿${received}`);
      });
    } catch (e) {
      console.log(`  [${label}] ${addr} — on-chain check FAILED: ${e.response?.status || ''} ${e.message}`);
    }
    await sleep(2000);
  }

  async function fetchBtcAddressTxs(address) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const resp = await axios.get(`https://blockstream.info/api/address/${address}/txs`, { timeout: 10000 });
        return resp.data;
      } catch (e) {
        if (e.response?.status === 429 && attempt < 4) { await sleep(4000 * (attempt + 1)); continue; }
        throw e;
      }
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
