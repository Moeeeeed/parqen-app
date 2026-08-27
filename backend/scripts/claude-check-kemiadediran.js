// READ-ONLY: trace how this user's BTC balance was built up — trading (escrow
// releases from P2P trades) vs on-chain deposit. Every DB query is SELECT-only.
// On-chain check is a read-only public blockchain lookup. No writes, no RPC calls.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const EMAIL = 'kemiadediran360@gmail.com';

(async () => {
  console.log('=== 1. User lookup ===');
  const { data: user, error: uErr } = await supa.from('users')
    .select('id, username, email, phone_number, created_at, account_status, kyc_status, is_email_verified, is_phone_verified, is_id_verified')
    .ilike('email', EMAIL).maybeSingle();
  if (uErr || !user) { console.log('User lookup failed:', uErr?.message || 'not found'); return; }
  console.log(user);

  console.log('\n=== 2. wallets (authoritative) ===');
  const { data: wal } = await supa.from('wallets')
    .select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt, address, tron_address, updated_at')
    .eq('user_id', user.id).maybeSingle();
  console.log(wal);

  console.log('\n=== 3. user_wallets (checkpoint + address) ===');
  const { data: uw } = await supa.from('user_wallets')
    .select('btc_address, tron_address, last_onchain_btc, last_onchain_usdt, updated_at')
    .eq('user_id', user.id).maybeSingle();
  console.log(uw);

  console.log('\n=== 4. Complete wallet_transactions history (all time, chronological) ===');
  const { data: txs } = await supa.from('wallet_transactions')
    .select('type, currency, amount_btc, amount_usdt, status, tx_hash, notes, created_at')
    .eq('user_id', user.id).order('created_at', { ascending: true });
  console.log(`Total rows: ${(txs || []).length}`);
  (txs || []).forEach(t => console.log(`  - ${t.created_at} | ${t.type} | ${t.currency} | btc=${t.amount_btc} usdt=${t.amount_usdt} | ${t.status} | tx=${t.tx_hash || ''} | ${t.notes || ''}`));

  const deposits = (txs || []).filter(t => t.type === 'DEPOSIT');
  const escrowReleases = (txs || []).filter(t => t.type === 'ESCROW_RELEASE');
  const swaps = (txs || []).filter(t => t.type === 'SWAP');
  console.log(`\nSummary: DEPOSIT rows=${deposits.length} | ESCROW_RELEASE (trade proceeds) rows=${escrowReleases.length} | SWAP rows=${swaps.length}`);

  console.log('\n=== 5. Trades — buyer or seller, all statuses ===');
  const { data: trades } = await supa.from('trades')
    .select('id, status, trade_type, amount_usd, amount_btc, buyer_id, seller_id, gift_card_brand, payment_method, created_at, completed_at')
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('created_at', { ascending: false }).limit(20);
  console.log(`Total (last 20): ${(trades || []).length}`);
  (trades || []).forEach(t => console.log(`  - ${t.created_at} | role=${t.buyer_id === user.id ? 'buyer' : 'seller'} | status=${t.status} | ${t.amount_btc || t.amount_usd} | ${t.gift_card_brand || t.payment_method || ''}`));

  console.log('\n=== 6. balance_audit (last 10) ===');
  const { data: audit } = await supa.from('balance_audit').select('reason, change_btc, new_balance, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
  (audit || []).forEach(a => console.log(`  - ${a.created_at} | ${a.reason} | change_btc=${a.change_btc} | new_balance=${a.new_balance}`));

  console.log('\n=== 7. On-chain check (BTC address, if any) ===');
  const btcAddr = uw?.btc_address || wal?.address;
  if (btcAddr) {
    try {
      const { data: full } = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${btcAddr}/full?limit=20`, { timeout: 15000 });
      console.log(`  address: ${btcAddr}`);
      console.log(`  on-chain balance: ₿${(full.balance/1e8).toFixed(8)} | wallets.balance_btc: ${wal?.balance_btc} | checkpoint last_onchain_btc: ${uw?.last_onchain_btc}`);
      console.log(`  n_tx=${full.n_tx}, total_received=₿${(full.total_received/1e8).toFixed(8)}, total_sent=₿${(full.total_sent/1e8).toFixed(8)}`);
      (full.txs || []).forEach(tx => {
        const receivedHere = (tx.outputs || []).filter(o => (o.addresses||[]).includes(btcAddr)).reduce((s,o)=>s+o.value,0);
        const sentFromHere = (tx.inputs || []).filter(i => (i.addresses||[]).includes(btcAddr)).reduce((s,i)=>s+(i.output_value||0),0);
        console.log(`    - hash=${tx.hash} | confirmed=${tx.confirmed || 'unconfirmed'} | received=₿${(receivedHere/1e8).toFixed(8)} | sent=₿${(sentFromHere/1e8).toFixed(8)}`);
      });
    } catch (e) { console.log('  on-chain check error:', e.response?.status || '', e.message); }
  } else {
    console.log('  No BTC address on file for this user.');
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
