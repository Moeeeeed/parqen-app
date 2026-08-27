// READ-ONLY re-check for king888. SELECT-only DB queries + a read-only
// BlockCypher lookup (already proven reachable from this host). No writes,
// no RPC calls, no credits.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USER_ID = '3c4f8383-85b4-4099-9bae-c67ed9345cd9';
const MONITORED_ADDRESS = 'bc1qnqwv9jt53suwzmrl8px2qphwt0vp2cqe04uxjw';

(async () => {
  console.log('=== Fresh raw DB read (not a dashboard summary) ===');
  const { data: wal } = await supa.from('wallets').select('balance_btc, locked_balance_btc, updated_at').eq('user_id', USER_ID).maybeSingle();
  console.log('wallets:', wal);
  const { data: ub } = await supa.from('user_balances').select('balance_btc, balance_usd, updated_at').eq('user_id', USER_ID).maybeSingle();
  console.log('user_balances:', ub);
  const { data: uw } = await supa.from('user_wallets').select('balance_btc, last_onchain_btc, updated_at').eq('user_id', USER_ID).maybeSingle();
  console.log('user_wallets:', uw);

  console.log('\n=== Any NEW wallet_transactions since last check ===');
  const { data: txs } = await supa.from('wallet_transactions')
    .select('type, currency, amount_btc, status, tx_hash, notes, created_at')
    .eq('user_id', USER_ID)
    .gte('created_at', '2026-08-25T00:00:00')
    .order('created_at', { ascending: false });
  console.log(`Total rows since 2026-08-25: ${(txs||[]).length}`);
  (txs||[]).forEach(t => console.log(`  - ${t.created_at} | ${t.type} | ${t.currency} | ${t.amount_btc} | ${t.status} | ${t.tx_hash||''} | ${t.notes||''}`));

  console.log('\n=== Fresh on-chain check (BlockCypher) — any NEW deposits beyond the 2 already found? ===');
  try {
    const { data: full } = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${MONITORED_ADDRESS}/full?limit=50`, { timeout: 15000 });
    console.log(`current on-chain balance: ${full.balance} sats (₿${(full.balance/1e8).toFixed(8)}) | n_tx: ${full.n_tx}`);
    (full.txs || []).forEach(tx => {
      const receivedHere = (tx.outputs || []).filter(o => (o.addresses||[]).includes(MONITORED_ADDRESS)).reduce((s,o)=>s+o.value,0);
      const sentFromHere = (tx.inputs || []).filter(i => (i.addresses||[]).includes(MONITORED_ADDRESS)).reduce((s,i)=>s+(i.output_value||0),0);
      const when = tx.confirmed || 'UNCONFIRMED';
      console.log(`  - hash=${tx.hash} | confirmed=${when} | confirmations=${tx.confirmations} | received_here=₿${(receivedHere/1e8).toFixed(8)} | sent_from_here=₿${(sentFromHere/1e8).toFixed(8)}`);
    });
  } catch (e) {
    console.log('  on-chain check FAILED:', e.response?.status || '', e.message);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
