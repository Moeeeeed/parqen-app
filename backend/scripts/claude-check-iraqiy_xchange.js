// READ-ONLY forensic check: Iraqiy_Xchange reports sending funds but can't see
// them. Every DB query is SELECT-only; on-chain checks are read-only public
// blockchain lookups. No writes, no RPC calls, no credits.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USERNAME = 'Iraqiy_Xchange';

(async () => {
  console.log('=== 1. User lookup ===');
  const { data: user, error: uErr } = await supa.from('users')
    .select('id, username, email, created_at, account_status, kyc_status')
    .ilike('username', USERNAME).maybeSingle();
  if (uErr || !user) { console.log('User lookup failed:', uErr?.message || 'not found'); return; }
  console.log('user_id:', user.id, '| email:', user.email, '| created_at:', user.created_at, '| status:', user.account_status, '| kyc:', user.kyc_status);

  console.log('\n=== 2. wallets (authoritative) ===');
  const { data: wal } = await supa.from('wallets')
    .select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt, address, tron_address, updated_at')
    .eq('user_id', user.id).maybeSingle();
  console.log(wal);

  console.log('\n=== 3. user_wallets (checkpoint + address, NOT authoritative for balance) ===');
  const { data: uw } = await supa.from('user_wallets')
    .select('btc_address, tron_address, last_onchain_btc, last_onchain_usdt, balance_btc, updated_at')
    .eq('user_id', user.id).maybeSingle();
  console.log(uw);

  console.log('\n=== 4. user_balances (mirror, comparison only) ===');
  const { data: ub } = await supa.from('user_balances').select('balance_btc, balance_usd, updated_at').eq('user_id', user.id).maybeSingle();
  console.log(ub);

  console.log('\n=== 5. wallet_transactions (last 30, newest first) ===');
  const { data: txs } = await supa.from('wallet_transactions')
    .select('type, currency, amount_btc, amount_usdt, status, tx_hash, notes, created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
  console.log(`count: ${(txs || []).length}`);
  (txs || []).forEach(t => console.log(`  - ${t.created_at} | ${t.type} | ${t.currency} | btc=${t.amount_btc} usdt=${t.amount_usdt} | ${t.status} | tx=${t.tx_hash || ''} | ${t.notes || ''}`));
  const deposits = (txs || []).filter(t => t.type === 'DEPOSIT');
  console.log(`DEPOSIT rows: ${deposits.length}`);
  deposits.forEach(t => console.log('  ', JSON.stringify(t)));

  console.log('\n=== 6. balance_audit (last 10) ===');
  const { data: audit } = await supa.from('balance_audit').select('reason, change_btc, new_balance, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10);
  (audit || []).forEach(a => console.log(`  - ${a.created_at} | ${a.reason} | change_btc=${a.change_btc} | new_balance=${a.new_balance}`));

  console.log('\n=== 7. On-chain check ===');
  if (uw?.tron_address) {
    try {
      const onchainUsdt = await tronWallet.getUSDTBalance(uw.tron_address);
      console.log(`  USDT (Tron) ${uw.tron_address}: on-chain=$${onchainUsdt} | wallets.balance_usdt=${wal?.balance_usdt} | checkpoint last_onchain_usdt=${uw.last_onchain_usdt}`);
      const last = parseFloat(uw.last_onchain_usdt || 0);
      if (onchainUsdt > last + 0.01) console.log(`  >>> USDT FLAG: on-chain exceeds checkpoint by $${(onchainUsdt - last).toFixed(6)} — uncredited.`);
    } catch (e) { console.log('  USDT on-chain check error:', e.message); }
  } else {
    console.log('  No tron_address on file.');
  }

  const btcAddr = uw?.btc_address || wal?.address;
  if (btcAddr) {
    try {
      const { data: full } = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${btcAddr}/full?limit=50`, { timeout: 15000 });
      console.log(`  BTC ${btcAddr}: on-chain balance=₿${(full.balance/1e8).toFixed(8)} | wallets.balance_btc=${wal?.balance_btc} | checkpoint last_onchain_btc=${uw?.last_onchain_btc}`);
      console.log(`  n_tx=${full.n_tx}`);
      (full.txs || []).forEach(tx => {
        const receivedHere = (tx.outputs || []).filter(o => (o.addresses||[]).includes(btcAddr)).reduce((s,o)=>s+o.value,0);
        const sentFromHere = (tx.inputs || []).filter(i => (i.addresses||[]).includes(btcAddr)).reduce((s,i)=>s+(i.output_value||0),0);
        console.log(`    - hash=${tx.hash} | confirmed=${tx.confirmed || 'unconfirmed'} | received=₿${(receivedHere/1e8).toFixed(8)} | sent=₿${(sentFromHere/1e8).toFixed(8)}`);
      });
    } catch (e) { console.log('  BTC on-chain check error:', e.response?.status || '', e.message); }
  } else {
    console.log('  No btc_address on file.');
  }

  console.log('\n=== 8. praqen_credit_deposit RPC status (side-effect-free) ===');
  const { error } = await supa.rpc('praqen_credit_deposit', {
    p_user_id: '00000000-0000-0000-0000-000000000000', p_currency: 'USDT', p_amount: 0.000001,
    p_onchain_balance: 0, p_idempotency_key: 'check-' + Date.now(), p_note: 'existence check',
  });
  if (!error) console.log('  unexpected success');
  else if (error.code === 'PGRST202') console.log('  MISSING (PGRST202)');
  else console.log('  EXISTS —', error.code, error.message);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
