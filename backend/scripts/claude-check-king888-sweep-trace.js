// READ-ONLY, third pass for king888. Every query is SELECT-only. On-chain
// checks are read-only blockchain lookups. No writes, no RPC calls.
//
// Goals:
//  1. Find the sweep tx_hash across every relevant table.
//  2. Fetch the COMPLETE escrow_locks history (no LIMIT this time) so the
//     ledger reconstruction below isn't working off a truncated view.
//  3. Programmatically reconstruct available/locked balance_btc from the full
//     wallet_transactions + escrow_locks history, rather than by hand.
//  4. Retry the on-chain balance/tx-history check for both candidate BTC
//     addresses (rate-limited last time).
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USER_ID = '3c4f8383-85b4-4099-9bae-c67ed9345cd9';
const SWEEP_TX_HASH = '4c47ef3a9488af1e2af3f2a2fcfa944ca5ca2e2d784835e38e35c926cd8e70cf';
const WALLETS_BTC_ADDRESS = 'bc1q2f5b6f4f5cba137d78282e4ed16b8352b294ab6e';
const USER_WALLETS_BTC_ADDRESS = 'bc1qnqwv9jt53suwzmrl8px2qphwt0vp2cqe04uxjw';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await axios.get(url, { timeout: 10000 });
      return resp.data;
    } catch (e) {
      const status = e.response?.status;
      if (status === 429 && attempt < 3) {
        const wait = 6000 * (attempt + 1);
        console.log(`  [${label}] rate limited, retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
}

(async () => {
  console.log('=== 1. Search for the sweep tx_hash across every relevant table ===');
  const { data: wtRows } = await supa.from('wallet_transactions').select('*').or(`tx_hash.eq.${SWEEP_TX_HASH},destination_address.eq.${SWEEP_TX_HASH}`);
  console.log(`  wallet_transactions: ${(wtRows || []).length} row(s)`);
  (wtRows || []).forEach(r => console.log('   ', JSON.stringify(r)));

  const { data: hwsRows, error: hwsErr } = await supa.from('hot_wallet_sweeps').select('*').eq('tx_hash', SWEEP_TX_HASH);
  if (hwsErr) console.log('  hot_wallet_sweeps: query error (table may not exist / different schema):', hwsErr.message);
  else { console.log(`  hot_wallet_sweeps: ${(hwsRows || []).length} row(s)`); (hwsRows || []).forEach(r => console.log('   ', JSON.stringify(r))); }

  const { data: dtRows, error: dtErr } = await supa.from('deposit_tracking').select('*').eq('tx_hash', SWEEP_TX_HASH);
  if (dtErr) console.log('  deposit_tracking: query error:', dtErr.message);
  else { console.log(`  deposit_tracking: ${(dtRows || []).length} row(s)`); (dtRows || []).forEach(r => console.log('   ', JSON.stringify(r))); }

  console.log('\n=== 2. Complete escrow_locks history for king888 (no LIMIT) ===');
  const { data: allLocks } = await supa.from('escrow_locks')
    .select('id, trade_id, seller_id, status, amount_usdt, amount_btc, currency, created_at')
    .eq('seller_id', USER_ID)
    .order('created_at', { ascending: true });
  console.log(`  Total escrow_locks rows: ${(allLocks || []).length}`);
  (allLocks || []).forEach(e => console.log(`   - ${e.created_at} | trade=${e.trade_id.slice(0,8)} | status=${e.status} | amount_btc=${e.amount_btc}`));

  console.log('\n=== 3. Full wallet_transactions (BTC only, chronological) ===');
  const { data: allTxs } = await supa.from('wallet_transactions')
    .select('type, amount_btc, status, tx_hash, notes, created_at')
    .eq('user_id', USER_ID)
    .eq('currency', 'BTC')
    .order('created_at', { ascending: true });
  console.log(`  Total BTC wallet_transactions: ${(allTxs || []).length}`);

  console.log('\n=== 4. Programmatic ledger reconstruction ===');
  let available = 0, locked = 0;
  const lockByTrade = {};
  for (const l of (allLocks || [])) lockByTrade[l.trade_id] = l;

  const seenLockTrades = new Set();
  for (const t of (allTxs || [])) {
    const amt = parseFloat(t.amount_btc || 0);
    if (t.type === 'DEPOSIT' && t.status === 'CONFIRMED') {
      available += amt;
      console.log(`  ${t.created_at} DEPOSIT +${amt} -> available=${available.toFixed(8)}`);
    } else if (t.type === 'SWEEP') {
      console.log(`  ${t.created_at} SWEEP ${amt} (no balance effect by design) -> available=${available.toFixed(8)} unchanged`);
    } else if (t.type === 'ESCROW_LOCK' && t.status === 'CONFIRMED') {
      available -= amt; locked += amt;
      const tradeIdMatch = (t.notes || '').match(/trade #([a-f0-9]+)/i);
      console.log(`  ${t.created_at} ESCROW_LOCK -${amt} -> available=${available.toFixed(8)} locked=${locked.toFixed(8)} (${t.notes})`);
    } else if (t.type === 'ESCROW_REFUND' && t.status === 'CONFIRMED') {
      available += amt; locked = Math.max(0, locked - amt);
      console.log(`  ${t.created_at} ESCROW_REFUND +${amt} -> available=${available.toFixed(8)} locked=${locked.toFixed(8)} (${t.notes || '(no notes)'})`);
    } else if (t.type === 'ESCROW_REFUND' && t.status === 'REVERSED') {
      console.log(`  ${t.created_at} ESCROW_REFUND +${amt} REVERSED -> no effect applied (${t.notes})`);
    } else {
      console.log(`  ${t.created_at} ${t.type} (${t.status}) amt=${amt} -> not applied by this reconstruction, review manually`);
    }
  }

  // Any escrow_locks row whose trade never got an ESCROW_REFUND (i.e. still
  // contributing to `locked` above) represents funds that were RELEASED
  // (sold successfully) — they permanently leave `locked`, no further effect
  // on `available` (already deducted at lock time).
  console.log(`\n  After all ledger entries: available=${available.toFixed(8)}  locked=${locked.toFixed(8)}`);
  console.log(`  (Remaining "locked" here should correspond to RELEASED trades whose lock was`);
  console.log(`   never matched by a refund in the ledger above — those funds already left permanently.)`);
  console.log(`  Reconstructed FINAL available (locked treated as permanently released) = ${available.toFixed(8)}`);

  console.log('\n  Compare to:');
  const { data: wal } = await supa.from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', USER_ID).maybeSingle();
  console.log(`    wallets.balance_btc (current, actual) = ${wal?.balance_btc}`);
  console.log(`    wallets.locked_balance_btc (current, actual) = ${wal?.locked_balance_btc}`);
  const diff = parseFloat((available - parseFloat(wal?.balance_btc || 0)).toFixed(8));
  console.log(`    DIFFERENCE (reconstructed - actual) = ${diff}`);

  console.log('\n=== 5. On-chain retry (rate-limit cooldown attempted) ===');
  for (const [label, addr] of [['user_wallets.btc_address (the address actually monitored)', USER_WALLETS_BTC_ADDRESS], ['wallets.address (NOT monitored by either service)', WALLETS_BTC_ADDRESS]]) {
    try {
      const addrData = await fetchWithRetry(`https://blockstream.info/api/address/${addr}`, label);
      const cs = addrData?.chain_stats || {};
      const ms = addrData?.mempool_stats || {};
      console.log(`  [${label}] ${addr}`);
      console.log(`    confirmed balance: ₿${(((cs.funded_txo_sum||0)-(cs.spent_txo_sum||0))/1e8).toFixed(8)} | unconfirmed: ₿${(((ms.funded_txo_sum||0)-(ms.spent_txo_sum||0))/1e8).toFixed(8)}`);
      await sleep(3000);
      const txsData = await fetchWithRetry(`https://blockstream.info/api/address/${addr}/txs`, label + ' txs');
      console.log(`    on-chain tx count: ${(txsData||[]).length}`);
      (txsData || []).slice(0, 8).forEach(tx => {
        const received = (tx.vout || []).filter(o => o.scriptpubkey_address === addr).reduce((s, o) => s + o.value, 0) / 1e8;
        const sent = (tx.vin || []).filter(i => i.prevout?.scriptpubkey_address === addr).reduce((s, i) => s + (i.prevout?.value||0), 0) / 1e8;
        console.log(`      - txid=${tx.txid} | confirmed=${tx.status?.confirmed} | time=${tx.status?.block_time ? new Date(tx.status.block_time*1000).toISOString() : 'unconfirmed'} | received=₿${received} | sent_from_this_addr=₿${sent}`);
      });
    } catch (e) {
      console.log(`  [${label}] ${addr} — FAILED: ${e.response?.status || ''} ${e.message}`);
    }
    await sleep(3000);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
