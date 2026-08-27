// READ-ONLY forensic check: king888 reports depositing funds but can't see the
// balance. Every query below is SELECT-only. The two on-chain balance checks
// (Tron/USDT via tronWalletService, BTC via blockstream.info) are themselves
// read-only blockchain queries — nothing is written to the DB or the chain.
// No RPC that could mutate state is called anywhere in this script.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USERNAME = 'king888';

async function fetchBtcAddress(address) {
  const resp = await axios.get(`https://blockstream.info/api/address/${address}`, { timeout: 10000 });
  return resp.data;
}

(async () => {
  console.log('=== 1. User lookup ===');
  const { data: user, error: uErr } = await supa
    .from('users')
    .select('id, username, email, created_at, account_status, kyc_status')
    .ilike('username', USERNAME)
    .maybeSingle();
  if (uErr || !user) { console.log('User lookup failed:', uErr?.message || 'not found'); return; }
  console.log('user_id:', user.id, '| email:', user.email, '| created_at:', user.created_at, '| status:', user.account_status, '| kyc:', user.kyc_status);

  console.log('\n=== 2. wallets (authoritative) ===');
  const { data: wal, error: walErr } = await supa
    .from('wallets')
    .select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt, address, tron_address, updated_at')
    .eq('user_id', user.id).maybeSingle();
  console.log('row exists:', !!wal, walErr?.message || '');
  console.log(wal);

  console.log('\n=== 3. wallet_transactions (all, last 30, newest first) ===');
  const { data: txs, error: txErr } = await supa
    .from('wallet_transactions')
    .select('id, type, currency, amount_btc, amount_usdt, status, tx_hash, destination_address, notes, idempotency_key, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);
  console.log('error:', txErr?.message || 'none', '| count:', (txs || []).length);
  (txs || []).forEach(t => console.log(`  - ${t.created_at} | ${t.type} | ${t.currency} | amt_btc=${t.amount_btc} amt_usdt=${t.amount_usdt} | status=${t.status} | tx_hash=${t.tx_hash || '(none)'} | notes=${t.notes || ''}`));

  const deposits = (txs || []).filter(t => t.type === 'DEPOSIT');
  console.log(`\n  DEPOSIT-type rows found: ${deposits.length}`);
  deposits.forEach(t => console.log('   ', JSON.stringify(t)));

  console.log('\n=== 4. user_balances / user_wallets (mirrors — for comparison ONLY, not authoritative) ===');
  const { data: ub } = await supa.from('user_balances').select('balance_btc, balance_usd, updated_at').eq('user_id', user.id).maybeSingle();
  console.log('user_balances:', ub);
  const { data: uw } = await supa.from('user_wallets')
    .select('btc_address, tron_address, last_onchain_btc, last_onchain_usdt, balance_btc, updated_at')
    .eq('user_id', user.id).maybeSingle();
  console.log('user_wallets (checkpoint/address + legacy balance_btc mirror):', uw);

  console.log('\n=== 5. balance_audit (fraud-guard ledger reference, last 15) ===');
  const { data: audit } = await supa.from('balance_audit')
    .select('reason, change_btc, new_balance, created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(15);
  (audit || []).forEach(a => console.log(`  - ${a.created_at} | reason=${a.reason} | change_btc=${a.change_btc} | new_balance=${a.new_balance}`));
  if (!audit || audit.length === 0) console.log('  (no balance_audit rows for this user)');

  console.log('\n=== 6. On-chain verification ===');
  if (uw?.tron_address) {
    try {
      const onchainUsdt = await tronWallet.getUSDTBalance(uw.tron_address);
      console.log(`  USDT (Tron) address ${uw.tron_address}: on-chain=$${onchainUsdt} | wallets.balance_usdt=${wal?.balance_usdt} | user_wallets.last_onchain_usdt=${uw.last_onchain_usdt}`);
      const lastUsdt = parseFloat(uw.last_onchain_usdt || 0);
      if (onchainUsdt > lastUsdt + 0.01) console.log(`  >>> USDT FLAG: on-chain exceeds last recorded checkpoint by $${(onchainUsdt - lastUsdt).toFixed(6)} — deposit not credited.`);
    } catch (e) { console.log('  USDT on-chain check error:', e.message); }
  } else {
    console.log('  No tron_address on file — no USDT deposit address ever provisioned for this account.');
  }

  const btcAddr = uw?.btc_address || wal?.address;
  if (btcAddr) {
    try {
      const addrData = await fetchBtcAddress(btcAddr);
      const chainStats = addrData?.chain_stats || {};
      const sats = (chainStats.funded_txo_sum || 0) - (chainStats.spent_txo_sum || 0);
      const onchainBtc = parseFloat((sats / 1e8).toFixed(8));
      const lastBtc = parseFloat(uw?.last_onchain_btc || 0);
      console.log(`  BTC address ${btcAddr}: on-chain=₿${onchainBtc} | wallets.balance_btc=${wal?.balance_btc} | user_wallets.last_onchain_btc=${uw?.last_onchain_btc}`);
      if (onchainBtc > lastBtc + 0.000000009) console.log(`  >>> BTC FLAG: on-chain exceeds last recorded checkpoint by ₿${(onchainBtc - lastBtc).toFixed(8)} — deposit not credited.`);

      // Recent BTC tx history from the public explorer, for tx_hash/timestamp evidence.
      const txsResp = await axios.get(`https://blockstream.info/api/address/${btcAddr}/txs`, { timeout: 10000 });
      console.log(`  Recent on-chain BTC txs at this address (${(txsResp.data || []).length} shown, most recent first):`);
      (txsResp.data || []).slice(0, 5).forEach(tx => {
        const received = (tx.vout || []).filter(o => o.scriptpubkey_address === btcAddr).reduce((s, o) => s + o.value, 0) / 1e8;
        console.log(`    - txid=${tx.txid} | confirmed=${tx.status?.confirmed} | block_time=${tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : 'unconfirmed'} | received_to_this_address=₿${received}`);
      });
    } catch (e) { console.log('  BTC on-chain check error:', e.message); }
  } else {
    console.log('  No btc_address on file — no BTC deposit address ever provisioned for this account.');
  }

  console.log('\n=== 7. praqen_credit_deposit RPC status ===');
  console.log('  Not re-invoked in this script (avoiding any RPC call during a forensic, credit-nothing check).');
  console.log('  Previously confirmed MISSING in production this session via a side-effect-free diagnostic (PGRST202) — see BALANCE_MISMATCH_INVESTIGATION.md.');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
