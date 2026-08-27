// READ-ONLY. Reuses hdWalletService's own apiGet() — a plain GET proxy across
// its 3-source rotation (mempool.space, blockstream.info, mempool.emzy.de) —
// instead of a single hardcoded host. No writes, no RPC, no balance changes.
// Requiring hdWalletService.js only constructs the singleton in-memory; it
// performs no network/DB calls on load.
require('dotenv').config();
const hdWallet = require('../services/hdWalletService');

const SWEEP_TXID = '4c47ef3a9488af1e2af3f2a2fcfa944ca5ca2e2d784835e38e35c926cd8e70cf';
const MONITORED_ADDRESS = 'bc1qnqwv9jt53suwzmrl8px2qphwt0vp2cqe04uxjw';

(async () => {
  console.log('=== 1. Sweep tx detail via hdWallet.apiGet (rotates mempool.space -> blockstream.info -> mempool.emzy.de) ===');
  try {
    const tx = await hdWallet.apiGet(`/tx/${SWEEP_TXID}`);
    console.log(`  txid: ${tx.txid}`);
    console.log(`  confirmed: ${tx.status?.confirmed} | block_time: ${tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : 'unconfirmed'}`);
    console.log(`  --- INPUTS ---`);
    (tx.vin || []).forEach((input, i) => {
      const prevAddr = input.prevout?.scriptpubkey_address;
      const prevValue = input.prevout?.value;
      console.log(`    [${i}] prev_txid=${input.txid} vout=${input.vout} | from=${prevAddr} | value=${prevValue} sats (₿${(prevValue / 1e8).toFixed(8)}) | is_monitored_address=${prevAddr === MONITORED_ADDRESS}`);
    });
    console.log(`  --- OUTPUTS ---`);
    (tx.vout || []).forEach((o, i) => console.log(`    [${i}] address=${o.scriptpubkey_address} | value=${o.value} sats (₿${(o.value / 1e8).toFixed(8)})`));
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
  }

  console.log('\n=== 2. Monitored address tx history via hdWallet.apiGet ===');
  try {
    const txs = await hdWallet.apiGet(`/address/${MONITORED_ADDRESS}/txs`);
    console.log(`  Total txs: ${(txs || []).length}`);
    (txs || []).forEach(tx => {
      const receivedHere = (tx.vout || []).filter(o => o.scriptpubkey_address === MONITORED_ADDRESS).reduce((s, o) => s + o.value, 0);
      console.log(`    - txid=${tx.txid} | confirmed=${tx.status?.confirmed} | time=${tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : 'unconfirmed'} | received_here=${receivedHere} sats (₿${(receivedHere / 1e8).toFixed(8)}) | is_sweep=${tx.txid === SWEEP_TXID}`);
    });
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
  }

  console.log('\n=== 3. Current balance via hdWallet.checkBalance (production helper) ===');
  try {
    const bal = await hdWallet.checkBalance(MONITORED_ADDRESS);
    console.log('  ', JSON.stringify(bal));
  } catch (e) {
    console.log(`  FAILED: ${e.message}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
