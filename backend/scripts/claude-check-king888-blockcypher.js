// READ-ONLY. BlockCypher just proved reachable from this host (checkBalance
// succeeded via it moments ago) when mempool.space/blockstream.info/emzy all
// failed. Querying BlockCypher's own full-address and single-tx endpoints
// directly — both are plain public GETs, no auth, no write capability.
const axios = require('axios');

const SWEEP_TXID = '4c47ef3a9488af1e2af3f2a2fcfa944ca5ca2e2d784835e38e35c926cd8e70cf';
const MONITORED_ADDRESS = 'bc1qnqwv9jt53suwzmrl8px2qphwt0vp2cqe04uxjw';

(async () => {
  console.log('=== 1. Sweep tx detail via BlockCypher ===');
  try {
    const { data: tx } = await axios.get(`https://api.blockcypher.com/v1/btc/main/txs/${SWEEP_TXID}`, { timeout: 15000 });
    console.log(`  hash: ${tx.hash} | confirmed: ${tx.confirmed} | block_height: ${tx.block_height} | fees: ${tx.fees} sats`);
    console.log('  --- INPUTS ---');
    (tx.inputs || []).forEach((inp, i) => {
      console.log(`    [${i}] prev_hashes=${inp.prev_hash} output_index=${inp.output_index} | addresses=${JSON.stringify(inp.addresses)} | output_value=${inp.output_value} sats (₿${(inp.output_value/1e8).toFixed(8)})`);
    });
    console.log('  --- OUTPUTS ---');
    (tx.outputs || []).forEach((out, i) => {
      console.log(`    [${i}] addresses=${JSON.stringify(out.addresses)} | value=${out.value} sats (₿${(out.value/1e8).toFixed(8)})`);
    });
  } catch (e) {
    console.log(`  FAILED: ${e.response?.status || ''} ${e.message}`);
  }

  console.log('\n=== 2. Full address history via BlockCypher (bc1qnqwv...uxjw) ===');
  try {
    const { data: full } = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${MONITORED_ADDRESS}/full?limit=50`, { timeout: 15000 });
    console.log(`  balance: ${full.balance} sats (₿${(full.balance/1e8).toFixed(8)}) | unconfirmed_balance: ${full.unconfirmed_balance} | final_balance: ${full.final_balance} sats (₿${(full.final_balance/1e8).toFixed(8)})`);
    console.log(`  n_tx: ${full.n_tx} | total_received: ${full.total_received} sats (₿${(full.total_received/1e8).toFixed(8)}) | total_sent: ${full.total_sent} sats (₿${(full.total_sent/1e8).toFixed(8)})`);
    console.log(`  --- Transactions (${(full.txs||[]).length}) ---`);
    (full.txs || []).forEach(tx => {
      const receivedHere = (tx.outputs || []).filter(o => (o.addresses||[]).includes(MONITORED_ADDRESS)).reduce((s,o)=>s+o.value,0);
      const sentFromHere = (tx.inputs || []).filter(i => (i.addresses||[]).includes(MONITORED_ADDRESS)).reduce((s,i)=>s+(i.output_value||0),0);
      console.log(`    - hash=${tx.hash} | confirmed=${tx.confirmed || 'unconfirmed'} | confirmations=${tx.confirmations} | received_here=${receivedHere} sats (₿${(receivedHere/1e8).toFixed(8)}) | sent_from_here=${sentFromHere} sats (₿${(sentFromHere/1e8).toFixed(8)}) | is_known_sweep=${tx.hash === SWEEP_TXID}`);
    });
  } catch (e) {
    console.log(`  FAILED: ${e.response?.status || ''} ${e.message}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
