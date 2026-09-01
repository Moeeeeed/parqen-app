// READ-ONLY forensic trace: where did hidil55555's ~0.50116472 BTC (~$40k) come from?
// Every DB query below is SELECT-only. The on-chain lookups (blockstream.info +
// blockcypher fallback) are read-only public GETs. No RPC is called. Nothing is
// written to the DB or the chain. This only reports; it does not correct anything.
//
// Context: this user already had one duplicate-deposit-log incident (0.20020222 BTC,
// Aug 23) — see scripts/reverse-hidil55555-dup-deposit.js and the
// "Duplicate deposit logged twice" entry in BALANCE_MISMATCH_INVESTIGATION.md.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USERNAME = 'hidil55555';
const f8 = n => Number(n || 0).toFixed(8);

async function btcAddrInfo(address) {
  try {
    const r = await axios.get(`https://blockstream.info/api/address/${address}`, { timeout: 12000 });
    const c = r.data?.chain_stats || {};
    const sats = (c.funded_txo_sum || 0) - (c.spent_txo_sum || 0);
    return { source: 'blockstream', received: (c.funded_txo_sum || 0) / 1e8, balance: sats / 1e8, txcount: c.tx_count };
  } catch (e) {
    try {
      const r = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${address}/balance`, { timeout: 12000 });
      return { source: 'blockcypher', received: (r.data.total_received || 0) / 1e8, balance: (r.data.balance || 0) / 1e8, txcount: r.data.n_tx };
    } catch (e2) { return { source: 'none', error: `${e.message} / ${e2.message}` }; }
  }
}
async function btcAddrTxs(address) {
  try {
    const r = await axios.get(`https://blockstream.info/api/address/${address}/txs`, { timeout: 12000 });
    return (r.data || []).map(tx => ({
      txid: tx.txid,
      confirmed: tx.status?.confirmed,
      time: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString() : 'unconfirmed',
      received: (tx.vout || []).filter(o => o.scriptpubkey_address === address).reduce((s, o) => s + o.value, 0) / 1e8,
      sent: (tx.vin || []).filter(i => i.prevout?.scriptpubkey_address === address).reduce((s, i) => s + i.prevout.value, 0) / 1e8,
    }));
  } catch (e) { return { error: e.message }; }
}

(async () => {
  // 1. user
  const { data: user, error: uErr } = await supa.from('users')
    .select('id, username, email, created_at, account_status, kyc_status, referral_earnings_btc, referred_by')
    .ilike('username', USERNAME).maybeSingle();
  if (uErr || !user) { console.log('user lookup failed:', uErr?.message || 'not found'); return; }
  console.log('=== 1. USER ===');
  console.log(user);

  // 2. authoritative + mirror balances
  const { data: wal } = await supa.from('wallets')
    .select('balance_btc, locked_balance_btc, balance_usd, balance_usdt, locked_balance_usdt, address, tron_address, created_at, updated_at')
    .eq('user_id', user.id).maybeSingle();
  const { data: ub } = await supa.from('user_balances').select('*').eq('user_id', user.id).maybeSingle();
  const { data: uw } = await supa.from('user_wallets')
    .select('btc_address, tron_address, last_onchain_btc, last_onchain_usdt, balance_btc, created_at, updated_at')
    .eq('user_id', user.id).maybeSingle();
  console.log('\n=== 2. BALANCES ===');
  console.log('wallets (authoritative):', wal);
  console.log('user_balances (mirror):', ub);
  console.log('user_wallets (checkpoint+mirror):', uw);

  // 3. full ledger
  const { data: txs, error: txErr } = await supa.from('wallet_transactions')
    .select('id, type, currency, amount_btc, amount_usdt, platform_fee_btc, status, tx_hash, destination_address, description, notes, idempotency_key, created_at, completed_at, reviewed_by')
    .eq('user_id', user.id).order('created_at', { ascending: true });
  console.log('\n=== 3. wallet_transactions (ALL, oldest first) ===');
  console.log('error:', txErr?.message || 'none', '| count:', (txs || []).length);
  let running = 0;
  const byType = {};
  (txs || []).forEach(t => {
    const amt = Number(t.amount_btc || 0);
    byType[t.type] = byType[t.type] || { count: 0, btc: 0, confirmedBtc: 0 };
    byType[t.type].count++; byType[t.type].btc += amt;
    const counts = ['CONFIRMED', 'COMPLETED', 'RELEASED', 'SUCCESS'].includes((t.status || '').toUpperCase());
    if (counts) byType[t.type].confirmedBtc += amt;
    console.log(`  ${t.created_at} | ${String(t.type).padEnd(14)} | ${String(t.currency || 'BTC').padEnd(5)} | btc=${f8(t.amount_btc).padStart(13)} | ${String(t.status).padEnd(10)} | fee=${t.platform_fee_btc || 0} | tx=${(t.tx_hash || '').slice(0, 20)} | idem=${t.idempotency_key || '-'} | ${t.description || t.notes || ''}`);
  });
  console.log('\n  --- ledger totals by type ---');
  Object.entries(byType).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} count=${v.count} sum_btc=${f8(v.btc)} confirmed_sum_btc=${f8(v.confirmedBtc)}`));

  // Rough reconstruction: credits minus debits among confirmed rows
  const CREDIT = ['DEPOSIT', 'ESCROW_RELEASE', 'TRADE_RELEASE', 'REFERRAL', 'REFERRAL_COMMISSION', 'BONUS', 'WELCOME_BONUS', 'ADMIN_CREDIT', 'REFUND', 'INTERNAL_TRANSFER_IN', 'SWAP_IN'];
  const DEBIT = ['WITHDRAWAL', 'SEND', 'ESCROW_LOCK', 'TRADE_LOCK', 'FEE', 'INTERNAL_TRANSFER_OUT', 'SWAP_OUT'];
  let credits = 0, debits = 0, unknown = [];
  (txs || []).forEach(t => {
    if (!['CONFIRMED', 'COMPLETED', 'RELEASED', 'SUCCESS'].includes((t.status || '').toUpperCase())) return;
    const amt = Number(t.amount_btc || 0);
    if (CREDIT.includes(t.type)) credits += amt;
    else if (DEBIT.includes(t.type)) debits += amt;
    else unknown.push(t.type);
  });
  console.log(`\n  reconstruction (confirmed rows only): credits=${f8(credits)} - debits=${f8(debits)} = ${f8(credits - debits)}`);
  console.log(`  wallets.balance_btc = ${f8(wal?.balance_btc)}  (diff vs reconstruction: ${f8((wal?.balance_btc || 0) - (credits - debits))})`);
  if (unknown.length) console.log('  UNCLASSIFIED tx types (not in credit/debit lists):', [...new Set(unknown)]);

  // 3b. duplicate-detection: same amount + type close in time, or shared tx_hash
  console.log('\n=== 3b. possible duplicate deposit rows ===');
  const deps = (txs || []).filter(t => t.type === 'DEPOSIT');
  const seenHash = {};
  deps.forEach(d => { if (d.tx_hash) { (seenHash[d.tx_hash] = seenHash[d.tx_hash] || []).push(d.id); } });
  Object.entries(seenHash).filter(([, ids]) => ids.length > 1).forEach(([h, ids]) => console.log(`  SAME tx_hash ${h} on ${ids.length} rows: ${ids.join(', ')}`));
  for (let i = 1; i < deps.length; i++) {
    const a = deps[i - 1], b = deps[i];
    if (Number(a.amount_btc) === Number(b.amount_btc) && Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 10 * 60 * 1000) {
      console.log(`  NEAR-DUP: ${a.id} & ${b.id} both ${f8(a.amount_btc)} BTC, ${Math.round((new Date(b.created_at) - new Date(a.created_at)) / 1000)}s apart | statuses ${a.status}/${b.status}`);
    }
  }
  if (deps.length === 0) console.log('  (no DEPOSIT rows)');

  // 4. trades
  const { data: tBuy } = await supa.from('trades').select('id, status, fee_status, amount_btc, amount_usd, platform_fee_btc, buyer_id, seller_id, created_at, completed_at')
    .eq('buyer_id', user.id).order('created_at', { ascending: false }).limit(50);
  const { data: tSell } = await supa.from('trades').select('id, status, fee_status, amount_btc, amount_usd, platform_fee_btc, buyer_id, seller_id, created_at, completed_at')
    .eq('seller_id', user.id).order('created_at', { ascending: false }).limit(50);
  console.log('\n=== 4. trades ===');
  const sumBtc = a => (a || []).reduce((s, t) => s + Number(t.amount_btc || 0), 0);
  console.log(`  as BUYER: ${(tBuy || []).length} trades, sum_btc=${f8(sumBtc(tBuy))}`);
  (tBuy || []).slice(0, 15).forEach(t => console.log(`    ${t.created_at} | ${t.id} | ${t.status}/${t.fee_status} | btc=${f8(t.amount_btc)} usd=${t.amount_usd}`));
  console.log(`  as SELLER: ${(tSell || []).length} trades, sum_btc=${f8(sumBtc(tSell))}`);
  (tSell || []).slice(0, 15).forEach(t => console.log(`    ${t.created_at} | ${t.id} | ${t.status}/${t.fee_status} | btc=${f8(t.amount_btc)} usd=${t.amount_usd}`));

  // 5. escrow locks
  const { data: locks } = await supa.from('escrow_locks').select('id, trade_id, status, amount_btc, currency, created_at, released_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
  console.log('\n=== 5. escrow_locks ===');
  console.log(`  count=${(locks || []).length}`);
  (locks || []).forEach(l => console.log(`    ${l.created_at} | ${l.id} | trade=${l.trade_id} | ${l.status} | ${f8(l.amount_btc)} ${l.currency || 'BTC'}`));

  // 6. referral / affiliate / bonus / admin credits
  const { data: aff } = await supa.from('affiliate_earnings').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
  console.log('\n=== 6. affiliate_earnings ===');
  console.log(`  count=${(aff || []).length}`, aff && aff.length ? '' : '(none)');
  (aff || []).forEach(a => console.log(`    ${a.created_at} | ${JSON.stringify(a)}`));

  for (const tbl of ['bonus_payouts', 'bonuses', 'admin_credits', 'balance_audit', 'seller_deposits', 'swap_transactions']) {
    try {
      const { data, error } = await supa.from(tbl).select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
      if (error) { console.log(`\n=== 6. ${tbl} === (skip: ${error.message})`); continue; }
      console.log(`\n=== 6. ${tbl} === count=${(data || []).length}`);
      (data || []).forEach(r => console.log('    ' + JSON.stringify(r)));
    } catch (e) { console.log(`\n=== 6. ${tbl} === (error ${e.message})`); }
  }

  // 7. on-chain
  console.log('\n=== 7. ON-CHAIN (BTC deposit address) ===');
  const btcAddr = uw?.btc_address || wal?.address;
  console.log('  monitored btc_address (user_wallets):', uw?.btc_address, '| wallets.address:', wal?.address);
  if (btcAddr) {
    const info = await btcAddrInfo(btcAddr);
    console.log('  address info:', info);
    console.log(`  last_onchain_btc checkpoint = ${uw?.last_onchain_btc}`);
    const txlist = await btcAddrTxs(btcAddr);
    if (Array.isArray(txlist)) {
      console.log(`  on-chain txs (${txlist.length}):`);
      txlist.forEach(t => console.log(`    ${t.time} | ${t.txid} | +${f8(t.received)} / -${f8(t.sent)} | confirmed=${t.confirmed}`));
      const totalReceived = txlist.reduce((s, t) => s + t.received, 0);
      console.log(`  >>> total BTC ever received on-chain at this address: ${f8(totalReceived)}`);
      console.log(`  >>> vs wallets.balance_btc ${f8(wal?.balance_btc)} + locked ${f8(wal?.locked_balance_btc)}`);
    } else {
      console.log('  tx list error:', txlist.error);
    }
  } else {
    console.log('  no BTC address on file');
  }

  console.log('\n=== DONE (read-only, nothing written) ===');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
