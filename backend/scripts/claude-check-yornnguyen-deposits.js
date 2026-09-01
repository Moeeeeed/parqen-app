// ============================================================================
// READ-ONLY diagnostic for user "yornnguyen" — reports a BTC + USDT deposit
// he says he sent but cannot see.
//
// SELECT-only against Supabase. The only network writes are GET requests to
// public block explorers (blockstream.info for BTC, tronWalletService for USDT).
// No .update / .insert / .delete / .rpc anywhere. Nothing is changed.
//
//   node scripts/claude-check-yornnguyen-deposits.js
// ============================================================================
'use strict';
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

let tronWallet = null;
try { tronWallet = require('../services/tronWalletService'); } catch (_) { /* optional */ }

const KNOWN_USER_ID = '695d7e05-999f-4264-9952-5ae6730de32a'; // from approve-yornnguyen-deposit.js
const f8 = n => Number(n || 0).toFixed(8);
const f6 = n => Number(n || 0).toFixed(6);
const line = () => console.log('-'.repeat(90));

async function fetchBtcAddr(address) {
  const { data } = await axios.get(`https://blockstream.info/api/address/${address}`, { timeout: 12000 });
  const cs = data?.chain_stats || {};
  const ms = data?.mempool_stats || {};
  return {
    confirmed_btc: parseFloat((((cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0)) / 1e8).toFixed(8)),
    confirmed_received_btc: parseFloat(((cs.funded_txo_sum || 0) / 1e8).toFixed(8)),
    unconfirmed_btc: parseFloat((((ms.funded_txo_sum || 0) - (ms.spent_txo_sum || 0)) / 1e8).toFixed(8)),
    tx_count: (cs.tx_count || 0) + (ms.tx_count || 0),
  };
}

async function fetchBtcTxs(address) {
  const { data } = await axios.get(`https://blockstream.info/api/address/${address}/txs`, { timeout: 12000 });
  return (data || []).map(tx => {
    const inMe = (tx.vout || []).filter(o => o.scriptpubkey_address === address);
    const received = inMe.reduce((s, o) => s + (o.value || 0), 0) / 1e8;
    return {
      txid: tx.txid,
      received_btc: parseFloat(received.toFixed(8)),
      confirmed: !!tx.status?.confirmed,
      block_time: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : null,
    };
  }).filter(t => t.received_btc > 0);
}

(async () => {
  console.log('='.repeat(90));
  console.log('yornnguyen deposit check (READ-ONLY) — ' + new Date().toISOString());
  console.log('='.repeat(90));

  // ---- 1. user row ----
  let user = null;
  {
    const { data: byId } = await supa.from('users').select('*').eq('id', KNOWN_USER_ID).maybeSingle();
    user = byId;
    if (!user) {
      const { data: byName } = await supa.from('users').select('*').ilike('username', 'yornnguyen').maybeSingle();
      user = byName;
    }
  }
  if (!user) { console.log('USER NOT FOUND (id or username). Stopping.'); process.exit(0); }
  const uid = user.id;
  console.log(`\n[1] USER`);
  console.log(`    id           : ${uid}`);
  console.log(`    username     : ${user.username}`);
  console.log(`    email        : ${user.email || '(n/a)'}`);
  console.log(`    created_at   : ${user.created_at || '(n/a)'}`);
  console.log(`    is_banned    : ${user.is_banned}`);
  console.log(`    id_verified  : ${user.is_id_verified ?? user.id_verified ?? '(n/a)'}`);

  // ---- 2. balance-bearing rows ----
  const [{ data: wal }, { data: uw }, { data: ub }] = await Promise.all([
    supa.from('wallets').select('*').eq('user_id', uid).maybeSingle(),
    supa.from('user_wallets').select('*').eq('user_id', uid).maybeSingle(),
    supa.from('user_balances').select('*').eq('user_id', uid).maybeSingle(),
  ]);

  console.log(`\n[2] BALANCES / WALLET ROWS`);
  console.log(`    wallets       : ${wal ? `BTC avail=${f8(wal.balance_btc)} locked=${f8(wal.locked_balance_btc)} | USDT avail=${f6(wal.balance_usdt)} locked=${f6(wal.locked_balance_usdt)} | updated ${wal.updated_at}` : '(NO ROW)'}`);
  console.log(`    user_balances : ${ub ? `BTC=${f8(ub.balance_btc)} USDT=${f6(ub.balance_usdt)} | updated ${ub.updated_at}` : '(no row)'}`);
  console.log(`    user_wallets  : ${uw ? `BTC bal=${f8(uw.balance_btc)} | last_onchain_btc=${f8(uw.last_onchain_btc)} last_onchain_usdt=${f6(uw.last_onchain_usdt)} | updated ${uw.updated_at}` : '(NO ROW)'}`);
  const btcAddress = uw?.btc_address || wal?.btc_address || null;
  const tronAddress = uw?.tron_address || wal?.tron_address || null;
  console.log(`    btc_address   : ${btcAddress || '(none on file)'}`);
  console.log(`    tron_address  : ${tronAddress || '(none on file)'}`);

  // ---- 3. wallet_transactions (all) ----
  const { data: txs } = await supa.from('wallet_transactions')
    .select('*').eq('user_id', uid).order('created_at', { ascending: true });
  console.log(`\n[3] wallet_transactions  (${(txs || []).length} rows, oldest first)`);
  (txs || []).forEach(t => console.log(
    `    ${t.created_at} | ${String(t.type).padEnd(10)} | ${String(t.currency || '').padEnd(4)} | BTC ${f8(t.amount_btc)} | USDT ${f6(t.amount_usdt)} | ${t.status} | tx=${t.tx_hash || '-'} | ${t.notes || ''}`
  ));
  if (!(txs || []).length) console.log('    (none — no deposit was ever recorded for this account)');

  // ---- 4. seller_deposits (security deposit flow) ----
  const { data: sd } = await supa.from('seller_deposits')
    .select('*').eq('user_id', uid).order('created_at', { ascending: true });
  console.log(`\n[4] seller_deposits  (${(sd || []).length} rows)`);
  (sd || []).forEach(d => console.log(`    ${d.created_at} | status=${d.status} | amount_usdt=${d.amount_usdt} | approved_at=${d.approved_at || '-'} | tx=${d.tx_hash || d.deposit_tx_hash || '-'}`));

  // ---- 5. deposit_addresses / pending intents (best-effort, table may not exist) ----
  for (const tbl of ['deposit_intents', 'pending_deposits', 'deposits']) {
    try {
      const { data, error } = await supa.from(tbl).select('*').eq('user_id', uid).limit(50);
      if (error) continue;
      console.log(`\n[5] ${tbl}  (${(data || []).length} rows)`);
      (data || []).forEach(r => console.log('    ' + JSON.stringify(r)));
    } catch (_) { /* table not present */ }
  }

  // ---- 6. on-chain BTC ----
  console.log(`\n[6] ON-CHAIN BTC`);
  if (!btcAddress) {
    console.log('    no BTC address on file — nothing to check');
  } else {
    try {
      const s = await fetchBtcAddr(btcAddress);
      console.log(`    address              : ${btcAddress}`);
      console.log(`    confirmed balance    : BTC ${f8(s.confirmed_btc)}`);
      console.log(`    lifetime received    : BTC ${f8(s.confirmed_received_btc)}`);
      console.log(`    unconfirmed (mempool): BTC ${f8(s.unconfirmed_btc)}`);
      console.log(`    tx count             : ${s.tx_count}`);
      const lastSeen = parseFloat(uw?.last_onchain_btc || 0);
      const undetected = parseFloat((s.confirmed_received_btc - lastSeen).toFixed(8));
      console.log(`    last_onchain_btc     : BTC ${f8(lastSeen)}   => received-minus-lastSeen = BTC ${f8(undetected)} ${undetected > 0.000000009 ? '  <-- POSSIBLE UNCREDITED DEPOSIT' : ''}`);
      const btcTxs = await fetchBtcTxs(btcAddress);
      console.log(`    incoming txs (${btcTxs.length}):`);
      btcTxs.forEach(t => console.log(`      ${t.block_time || '(unconfirmed)'} | +${f8(t.received_btc)} BTC | conf=${t.confirmed} | ${t.txid}`));
    } catch (e) {
      console.log('    explorer error: ' + e.message);
    }
  }

  // ---- 7. on-chain USDT (TRC20) ----
  console.log(`\n[7] ON-CHAIN USDT (Tron / TRC20)`);
  if (!tronAddress) {
    console.log('    no tron address on file — nothing to check');
  } else if (!tronWallet || typeof tronWallet.getUSDTBalance !== 'function') {
    console.log(`    tronWalletService unavailable in this context — check ${tronAddress} manually on tronscan.org`);
  } else {
    try {
      const bal = await tronWallet.getUSDTBalance(tronAddress);
      const lastSeen = parseFloat(uw?.last_onchain_usdt || 0);
      console.log(`    address           : ${tronAddress}`);
      console.log(`    on-chain USDT     : $${f6(bal)}`);
      console.log(`    last_onchain_usdt : $${f6(lastSeen)}   => diff = $${f6(bal - lastSeen)} ${bal - lastSeen > 0.01 ? '  <-- POSSIBLE UNCREDITED DEPOSIT' : ''}`);
    } catch (e) {
      console.log('    tron balance error: ' + e.message + `  (check ${tronAddress} on tronscan.org)`);
    }
  }

  // ---- 8. notifications sent to the user (context) ----
  const { data: notes } = await supa.from('notifications')
    .select('created_at, type, title, message, is_read')
    .eq('user_id', uid).order('created_at', { ascending: false }).limit(15);
  console.log(`\n[8] recent notifications (${(notes || []).length})`);
  (notes || []).forEach(n => console.log(`    ${n.created_at} | ${n.type} | ${n.title} | read=${n.is_read}`));

  line();
  console.log('DONE. Nothing was modified. Read sections [3], [6] and [7]:');
  console.log(' - If [6]/[7] show an on-chain deposit but [3] has no matching DEPOSIT row,');
  console.log('   the monitor missed it and it needs manual crediting (separate step, with approval).');
  console.log(' - If the explorer shows nothing, the funds never arrived at the address on file');
  console.log('   (wrong address / wrong network / still unconfirmed) — ask the user for the TXID.');
  line();
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e); process.exit(1); });
