// READ-ONLY on-chain trace, king888. No DB writes, no RPC calls, no balance
// changes. Every call here is a public block-explorer GET request.
// Priority: fetch the sweep tx's own detail (its inputs) first — a single
// targeted call, most likely to succeed given repeated rate-limiting on the
// broader address-history endpoint in prior attempts this session.
const axios = require('axios');

const SWEEP_TXID = '4c47ef3a9488af1e2af3f2a2fcfa944ca5ca2e2d784835e38e35c926cd8e70cf';
const MONITORED_ADDRESS = 'bc1qnqwv9jt53suwzmrl8px2qphwt0vp2cqe04uxjw';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, label, attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const resp = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'praqen-readonly-audit/1.0' } });
      return resp.data;
    } catch (e) {
      const status = e.response?.status;
      if (status === 429 && attempt < attempts - 1) {
        const wait = 10000 * (attempt + 1);
        console.log(`  [${label}] rate limited (attempt ${attempt + 1}/${attempts}), retrying in ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
}

(async () => {
  console.log('Waiting 15s before first call to maximize distance from prior rate-limited attempts...');
  await sleep(15000);

  console.log('\n=== 1. Sweep transaction detail (its own inputs = the UTXOs it spent) ===');
  let sweepTx = null;
  try {
    sweepTx = await fetchWithRetry(`https://blockstream.info/api/tx/${SWEEP_TXID}`, 'sweep tx detail');
    console.log(`  txid: ${sweepTx.txid}`);
    console.log(`  confirmed: ${sweepTx.status?.confirmed} | block_time: ${sweepTx.status?.block_time ? new Date(sweepTx.status.block_time * 1000).toISOString() : 'unconfirmed'} | block_height: ${sweepTx.status?.block_height}`);
    console.log(`  fee: ${sweepTx.fee} sats`);
    console.log(`  --- INPUTS (the UTXOs this sweep spent) ---`);
    (sweepTx.vin || []).forEach((input, i) => {
      const prevAddr = input.prevout?.scriptpubkey_address;
      const prevValue = input.prevout?.value;
      console.log(`    [${i}] prev_txid=${input.txid} vout=${input.vout} | from_address=${prevAddr} | value=${prevValue} sats (₿${(prevValue / 1e8).toFixed(8)}) | is_monitored_address=${prevAddr === MONITORED_ADDRESS}`);
    });
    console.log(`  --- OUTPUTS ---`);
    (sweepTx.vout || []).forEach((output, i) => {
      console.log(`    [${i}] address=${output.scriptpubkey_address} | value=${output.value} sats (₿${(output.value / 1e8).toFixed(8)})`);
    });
    const totalIn = (sweepTx.vin || []).reduce((s, i) => s + (i.prevout?.value || 0), 0);
    const totalOut = (sweepTx.vout || []).reduce((s, o) => s + (o.value || 0), 0);
    console.log(`  Total input: ${totalIn} sats (₿${(totalIn / 1e8).toFixed(8)}) | Total output: ${totalOut} sats (₿${(totalOut / 1e8).toFixed(8)}) | Fee: ${totalIn - totalOut} sats`);
  } catch (e) {
    console.log(`  FAILED after all retries: ${e.response?.status || ''} ${e.message}`);
  }

  await sleep(8000);

  console.log('\n=== 2. Monitored address full tx history (incoming to bc1qnqwv...uxjw) ===');
  try {
    const txs = await fetchWithRetry(`https://blockstream.info/api/address/${MONITORED_ADDRESS}/txs`, 'address tx history');
    console.log(`  Total txs at this address: ${(txs || []).length}`);
    (txs || []).forEach(tx => {
      const receivedHere = (tx.vout || []).filter(o => o.scriptpubkey_address === MONITORED_ADDRESS).reduce((s, o) => s + o.value, 0);
      const sentFromHere = (tx.vin || []).filter(i => i.prevout?.scriptpubkey_address === MONITORED_ADDRESS).reduce((s, i) => s + (i.prevout?.value || 0), 0);
      console.log(`    - txid=${tx.txid} | confirmed=${tx.status?.confirmed} | block_time=${tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : 'unconfirmed'} | received_here=${receivedHere} sats (₿${(receivedHere / 1e8).toFixed(8)}) | sent_from_here=${sentFromHere} sats (₿${(sentFromHere / 1e8).toFixed(8)}) | is_sweep_tx=${tx.txid === SWEEP_TXID}`);
    });
  } catch (e) {
    console.log(`  FAILED after all retries: ${e.response?.status || ''} ${e.message}`);
  }

  console.log('\n=== 3. Current confirmed/unconfirmed balance at monitored address ===');
  try {
    await sleep(5000);
    const addrData = await fetchWithRetry(`https://blockstream.info/api/address/${MONITORED_ADDRESS}`, 'address balance');
    const cs = addrData?.chain_stats || {};
    const ms = addrData?.mempool_stats || {};
    console.log(`  confirmed: ₿${(((cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0)) / 1e8).toFixed(8)}`);
    console.log(`  unconfirmed: ₿${(((ms.funded_txo_sum || 0) - (ms.spent_txo_sum || 0)) / 1e8).toFixed(8)}`);
    console.log(`  funded_txo_count: ${cs.funded_txo_count} | spent_txo_count: ${cs.spent_txo_count}`);
  } catch (e) {
    console.log(`  FAILED after all retries: ${e.response?.status || ''} ${e.message}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
