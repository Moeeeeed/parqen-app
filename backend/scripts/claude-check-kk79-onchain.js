// READ-ONLY. kingkong79-Pro BTC address on-chain (mempool.space + blockstream fallback)
// + balance_audit trail + wallets row timeline. No writes.
'use strict';
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const UID = 'e8d3d037-554b-4b09-b8f7-373f03de10de';
const ADDR = 'bc1qfaqwf5cukjca7pfcqlrggrppu474p69epam5uc';
const f8 = n => Number(n || 0).toFixed(8);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tryApis(path) {
  const bases = ['https://mempool.space/api', 'https://blockstream.info/api', 'https://blockchain.info'];
  for (const b of bases) {
    try {
      if (b.includes('blockchain.info')) {
        const { data } = await axios.get(`${b}/rawaddr/${ADDR}?limit=50`, { timeout: 15000 });
        return { src: b, data, kind: 'blockchain' };
      }
      const { data } = await axios.get(`${b}${path}`, { timeout: 15000 });
      return { src: b, data, kind: 'esplora' };
    } catch (e) {
      console.log(`   ${b} -> ${e.response?.status || e.code || e.message}`);
      await sleep(1500);
    }
  }
  throw new Error('all explorers failed');
}

(async () => {
  console.log(`kingkong79-Pro on-chain BTC + audit  ${new Date().toISOString()}`);
  console.log('addr:', ADDR);

  console.log('\n--- address summary ---');
  try {
    const r = await tryApis(`/address/${ADDR}`);
    if (r.kind === 'esplora') {
      const cs = r.data.chain_stats, ms = r.data.mempool_stats;
      console.log(`   src ${r.src}`);
      console.log(`   confirmed received : ${f8((cs.funded_txo_sum||0)/1e8)} BTC`);
      console.log(`   confirmed spent    : ${f8((cs.spent_txo_sum||0)/1e8)} BTC`);
      console.log(`   confirmed balance  : ${f8(((cs.funded_txo_sum||0)-(cs.spent_txo_sum||0))/1e8)} BTC`);
      console.log(`   mempool balance    : ${f8(((ms.funded_txo_sum||0)-(ms.spent_txo_sum||0))/1e8)} BTC`);
      console.log(`   tx count           : ${(cs.tx_count||0)+(ms.tx_count||0)}`);
    } else {
      console.log(`   src ${r.src}`);
      console.log(`   total_received : ${f8((r.data.total_received||0)/1e8)} BTC`);
      console.log(`   total_sent     : ${f8((r.data.total_sent||0)/1e8)} BTC`);
      console.log(`   final_balance  : ${f8((r.data.final_balance||0)/1e8)} BTC`);
      console.log(`   n_tx           : ${r.data.n_tx}`);
    }
  } catch (e) { console.log('   FAILED:', e.message); }

  console.log('\n--- incoming transactions ---');
  try {
    const r = await tryApis(`/address/${ADDR}/txs`);
    if (r.kind === 'esplora') {
      (r.data || []).forEach(tx => {
        const rec = (tx.vout||[]).filter(o => o.scriptpubkey_address === ADDR).reduce((s,o)=>s+(o.value||0),0)/1e8;
        if (rec > 0) console.log(`   ${tx.status?.block_time ? new Date(tx.status.block_time*1000).toISOString() : '(mempool)'} | +${f8(rec)} | conf=${!!tx.status?.confirmed} | ${tx.txid}`);
      });
    } else {
      (r.data.txs || []).forEach(tx => {
        const rec = (tx.out||[]).filter(o => o.addr === ADDR).reduce((s,o)=>s+(o.value||0),0)/1e8;
        if (rec > 0) console.log(`   ${tx.time ? new Date(tx.time*1000).toISOString() : '?'} | +${f8(rec)} | ${tx.hash}`);
      });
    }
  } catch (e) { console.log('   FAILED:', e.message); }

  console.log('\n--- balance_audit for this user (latest 20) ---');
  const { data: ba } = await supa.from('balance_audit').select('*').eq('user_id', UID).order('created_at', { ascending: false }).limit(20);
  (ba || []).forEach(r => console.log(`   ${r.created_at} | change_btc=${f8(r.change_btc)} | new_balance=${f8(r.new_balance)} | ${r.reason}`));
  if (!(ba || []).length) console.log('   (none)');

  console.log('\n--- wallets row now ---');
  const { data: w } = await supa.from('wallets').select('balance_btc, locked_balance_btc, balance_usdt, updated_at').eq('user_id', UID).maybeSingle();
  console.log('  ', JSON.stringify(w));

  console.log('\n--- deposit_tracking_v2 credited_at detail ---');
  const { data: dt } = await supa.from('deposit_tracking_v2').select('tx_hash,amount,credited,created_at,credited_at').eq('user_id', UID).order('created_at', { ascending: true });
  (dt || []).forEach(r => console.log(`   ${r.created_at} | ${r.amount} BTC | credited=${r.credited} | credited_at=${r.credited_at} | tx ${r.tx_hash}`));
  const sum = (dt || []).reduce((s, r) => s + Number(r.amount), 0);
  console.log(`   sum of dtv2 amounts: ${f8(sum)} BTC`);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e); process.exit(1); });
