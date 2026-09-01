// ============================================================================
// READ-ONLY deposit check for one user. SELECT-only against Supabase + public
// block-explorer GETs (blockstream.info for BTC, tronWalletService for USDT).
// No writes anywhere.
//   node scripts/claude-check-user-deposit.js <username-or-uuid>
// ============================================================================
'use strict';
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
let tronWallet = null;
try { tronWallet = require('../services/tronWalletService'); } catch (_) {}

const ARG = process.argv[2] || '';
const f8 = n => Number(n || 0).toFixed(8);
const f6 = n => Number(n || 0).toFixed(6);
const isUuid = s => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);

async function btcAddr(a) {
  const { data } = await axios.get(`https://blockstream.info/api/address/${a}`, { timeout: 12000 });
  const cs = data?.chain_stats || {}, ms = data?.mempool_stats || {};
  return {
    confirmed: parseFloat((((cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0)) / 1e8).toFixed(8)),
    received: parseFloat(((cs.funded_txo_sum || 0) / 1e8).toFixed(8)),
    mempool: parseFloat((((ms.funded_txo_sum || 0) - (ms.spent_txo_sum || 0)) / 1e8).toFixed(8)),
    txc: (cs.tx_count || 0) + (ms.tx_count || 0),
  };
}
async function btcTxs(a) {
  const { data } = await axios.get(`https://blockstream.info/api/address/${a}/txs`, { timeout: 12000 });
  return (data || []).map(tx => {
    const r = (tx.vout || []).filter(o => o.scriptpubkey_address === a).reduce((s, o) => s + (o.value || 0), 0) / 1e8;
    return { txid: tx.txid, in: parseFloat(r.toFixed(8)), conf: !!tx.status?.confirmed,
      t: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : null };
  }).filter(t => t.in > 0);
}
async function usdtHistory(addr) {
  const C = process.env.TRON_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const headers = {};
  if (process.env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
  const { data } = await axios.get(`https://api.trongrid.io/v1/accounts/${addr}/transactions/trc20`, {
    headers, timeout: 20000,
    params: { contract_address: C, limit: 50, order_by: 'block_timestamp,asc' },
  });
  return (data?.data || []).map(t => ({
    t: new Date(t.block_timestamp).toISOString(),
    dir: t.to === addr ? 'IN' : (t.from === addr ? 'OUT' : '?'),
    amt: Number(t.value) / 1e6, txid: t.transaction_id, from: t.from, to: t.to,
  }));
}

(async () => {
  console.log('='.repeat(90));
  console.log(`deposit check for "${ARG}"  (READ-ONLY)  ${new Date().toISOString()}`);
  console.log('='.repeat(90));

  let user = null;
  if (isUuid(ARG)) {
    ({ data: user } = await supa.from('users').select('*').eq('id', ARG).maybeSingle());
  } else {
    ({ data: user } = await supa.from('users').select('*').ilike('username', ARG).maybeSingle());
    if (!user) {
      const { data: many } = await supa.from('users').select('*').ilike('username', `%${ARG}%`).limit(10);
      if (many && many.length === 1) user = many[0];
      else if (many && many.length > 1) { console.log('multiple matches:', many.map(m => `${m.username} (${m.id})`)); process.exit(0); }
    }
  }
  if (!user) { console.log('USER NOT FOUND'); process.exit(0); }
  const uid = user.id;
  console.log(`\n[1] USER  ${user.username}  id=${uid}`);
  console.log(`    email=${user.email || '-'}  created=${user.created_at}  banned=${user.is_banned}`);

  const [{ data: wal }, { data: uw }, { data: ub }] = await Promise.all([
    supa.from('wallets').select('*').eq('user_id', uid).maybeSingle(),
    supa.from('user_wallets').select('*').eq('user_id', uid).maybeSingle(),
    supa.from('user_balances').select('*').eq('user_id', uid).maybeSingle(),
  ]);
  console.log(`\n[2] BALANCES`);
  console.log(`    wallets       : BTC avail=${f8(wal?.balance_btc)} locked=${f8(wal?.locked_balance_btc)} | USDT avail=${f6(wal?.balance_usdt)} locked=${f6(wal?.locked_balance_usdt)} | upd ${wal?.updated_at}`);
  console.log(`    user_balances : BTC=${f8(ub?.balance_btc)} USDT=${f6(ub?.balance_usdt)} | upd ${ub?.updated_at || '(NO ROW)'}`);
  console.log(`    user_wallets  : BTC=${f8(uw?.balance_btc)} | last_onchain_btc=${f8(uw?.last_onchain_btc)} last_onchain_usdt=${f6(uw?.last_onchain_usdt)} | upd ${uw?.updated_at || '(NO ROW)'}`);
  const btc = uw?.btc_address || wal?.btc_address || user.bitcoin_wallet_address || null;
  const tron = uw?.tron_address || wal?.tron_address || null;
  console.log(`    btc_address   : ${btc || '(none)'}`);
  console.log(`    tron_address  : ${tron || '(none)'}`);

  const { data: txs } = await supa.from('wallet_transactions').select('*').eq('user_id', uid)
    .order('created_at', { ascending: false }).limit(25);
  console.log(`\n[3] wallet_transactions (latest 25)`);
  (txs || []).forEach(t => console.log(`    ${t.created_at} | ${String(t.type).padEnd(12)} | ${String(t.currency||'').padEnd(4)} | BTC ${f8(t.amount_btc)} | USDT ${f6(t.amount_usdt)} | ${t.status} | tx=${(t.tx_hash||'-').slice(0,18)} | ${(t.notes||'').slice(0,60)}`));

  const { data: dtv2 } = await supa.from('deposit_tracking_v2').select('*').eq('user_id', uid).order('created_at', { ascending: false });
  console.log(`\n[4] deposit_tracking_v2 (${(dtv2||[]).length})`);
  (dtv2 || []).forEach(r => console.log(`    ${r.created_at} | ${r.currency} | ${r.amount} | credited=${r.credited} | ${r.detected_by} | tx ${String(r.tx_hash).slice(0,16)}`));

  const { data: fl } = await supa.from('reconciliation_flags').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(15);
  console.log(`\n[5] reconciliation_flags (${(fl||[]).length}, latest 15)`);
  (fl || []).forEach(r => console.log(`    ${r.created_at} | ${r.reason} | ${r.currency} | diff=${r.diff} | ${r.status} | ${JSON.stringify(r.detail).slice(0,110)}`));

  console.log(`\n[6] ON-CHAIN BTC  ${btc || '(no address)'}`);
  if (btc) {
    try {
      const s = await btcAddr(btc);
      console.log(`    confirmed balance ${f8(s.confirmed)} | lifetime received ${f8(s.received)} | mempool ${f8(s.mempool)} | txs ${s.txc}`);
      console.log(`    last_onchain_btc checkpoint: ${f8(uw?.last_onchain_btc)}`);
      const tl = await btcTxs(btc);
      console.log(`    incoming txs (${tl.length}):`);
      tl.forEach(t => console.log(`      ${t.t || '(UNCONFIRMED/mempool)'} | +${f8(t.in)} BTC | conf=${t.conf} | ${t.txid}`));
    } catch (e) { console.log('    explorer error: ' + e.message); }
  }

  console.log(`\n[7] ON-CHAIN USDT (TRC20)  ${tron || '(no address)'}`);
  if (tron) {
    try {
      const h = await usdtHistory(tron);
      let inSum = 0, outSum = 0;
      h.forEach(x => { if (x.dir === 'IN') inSum += x.amt; if (x.dir === 'OUT') outSum += x.amt; });
      h.forEach(x => console.log(`      ${x.t} | ${x.dir.padEnd(3)} | $${f6(x.amt)} | ${x.txid}`));
      console.log(`    total IN $${f6(inSum)} | total OUT $${f6(outSum)} | net $${f6(inSum - outSum)}`);
      if (tronWallet?.getUSDTBalance) {
        const b = await tronWallet.getUSDTBalance(tron).catch(() => null);
        if (b != null) console.log(`    live on-chain USDT balance: $${f6(b)}  | last_onchain_usdt checkpoint: $${f6(uw?.last_onchain_usdt)}`);
      }
    } catch (e) { console.log('    tron error: ' + (e.response?.status || '') + ' ' + e.message); }
  }

  console.log('\n' + '-'.repeat(90));
  console.log('Compare [6]/[7] on-chain arrivals against [3] DEPOSIT rows + [4] deposit_tracking_v2.');
  console.log('-'.repeat(90));
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e); process.exit(1); });
