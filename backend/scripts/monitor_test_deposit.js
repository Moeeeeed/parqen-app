// READ-ONLY monitor for the controlled test deposit (claude_deposit_test account).
// Every check here is a public blockchain read or a Supabase SELECT — no writes,
// no RPC calls, no crediting, no balance changes anywhere in this file.
//
// Checks:
//   1. Is the transaction confirmed on-chain?
//   2. Does it appear in wallet_transactions?
//   3. Does it appear in deposit_tracking_v2?
//   4. What is the test user's current wallet balance?
//   5. Reports all of the above.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const TXID        = 'c1631d5adad4f4fbba538f6c208bd1662680edbeea8fabf1aa987c248c12337d';
const ADDRESS      = 'bc1qslpq2rw7dgy0msk2n7levt7qf8zj5scwmtvdxn';
const USER_ID       = '0d139b9c-e550-4226-a272-27c02ac906c4';
const EXPECTED_BTC = 0.00053315;

async function fetchTxStatus() {
  const apis = ['https://blockstream.info/api', 'https://mempool.space/api'];
  let lastErr;
  for (const api of apis) {
    try {
      const { data } = await axios.get(`${api}/tx/${TXID}`, { timeout: 15000 });
      return data;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

(async () => {
  console.log(`=== Monitor check @ ${new Date().toISOString()} ===`);
  console.log('TXID:', TXID);
  console.log('Address:', ADDRESS);
  console.log('User ID:', USER_ID);
  console.log('Expected amount:', EXPECTED_BTC, 'BTC\n');

  // ── 1. On-chain confirmation status ────────────────────────────────────
  console.log('--- 1. On-chain confirmation status ---');
  let tx;
  try {
    tx = await fetchTxStatus();
    console.log('Confirmed:', !!tx.status?.confirmed);
    if (tx.status?.confirmed) {
      console.log('  Block height:', tx.status.block_height);
      console.log('  Block time  :', new Date(tx.status.block_time * 1000).toISOString());
    }
    const receivedSats = (tx.vout || []).filter(o => o.scriptpubkey_address === ADDRESS).reduce((s, o) => s + (o.value || 0), 0);
    console.log('  Amount received at address:', (receivedSats / 1e8).toFixed(8), 'BTC');
  } catch (e) {
    console.log('  ERROR fetching tx status:', e.message);
  }

  // ── 2. wallet_transactions ──────────────────────────────────────────────
  console.log('\n--- 2. wallet_transactions ---');
  const { data: wtx, error: wtxErr } = await supa.from('wallet_transactions')
    .select('*').eq('user_id', USER_ID).eq('tx_hash', TXID);
  if (wtxErr) console.log('  ERROR:', wtxErr.message);
  console.log('  Rows found:', (wtx || []).length);
  (wtx || []).forEach(r => console.log('  ', JSON.stringify(r)));

  // ── 3. deposit_tracking_v2 ───────────────────────────────────────────────
  console.log('\n--- 3. deposit_tracking_v2 ---');
  const { data: dtv2, error: dtErr } = await supa.from('deposit_tracking_v2')
    .select('*').eq('tx_hash', TXID).eq('address', ADDRESS);
  if (dtErr) console.log('  ERROR:', dtErr.message);
  console.log('  Rows found:', (dtv2 || []).length);
  (dtv2 || []).forEach(r => console.log('  ', JSON.stringify(r)));

  // ── 4. Test user's wallet balance ────────────────────────────────────────
  console.log('\n--- 4. Test user wallet balance ---');
  const { data: wal, error: walErr } = await supa.from('wallets')
    .select('balance_btc, updated_at').eq('user_id', USER_ID).maybeSingle();
  if (walErr) console.log('  ERROR:', walErr.message);
  console.log('  balance_btc:', wal?.balance_btc, '| updated_at:', wal?.updated_at);

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log('\n--- 5. Summary ---');
  const confirmed = !!tx?.status?.confirmed;
  const credited  = (wtx || []).length > 0;
  console.log('Confirmed on-chain:', confirmed);
  console.log('Credited (wallet_transactions row exists):', credited);
  console.log('Tracked (deposit_tracking_v2 row exists):', (dtv2 || []).length > 0);
  console.log('Outcome:', !confirmed ? 'WAITING — not yet confirmed' : credited ? 'SUCCESS — detected and recorded' : 'NOT YET DETECTED — confirmed on-chain but no wallet_transactions row');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.message); process.exit(1); });
