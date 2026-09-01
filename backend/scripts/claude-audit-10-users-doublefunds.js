// READ-ONLY forensic audit of 10 users. SELECT-only DB queries + read-only public
// blockchain-explorer GETs. No writes, no RPC, no deploy. Reports only.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const PRICE = 80000;
const f8 = n => Number(n || 0).toFixed(8);
const usd = n => '$' + Math.round(Number(n || 0) * PRICE).toLocaleString('en-US');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const USERS = ['hidil55555', 'king888', 'ukbuyer2022', 'Lhord_Exchange', 'messi_10', 'kingkong79-Pro', 'thetraderx', 'yornnguyen', 'topboy1', 'donrex'];

const CREDIT = ['DEPOSIT', 'ESCROW_REFUND', 'ESCROW_RELEASE', 'TRADE_RELEASE', 'REFERRAL', 'REFERRAL_COMMISSION', 'BONUS', 'WELCOME_BONUS', 'ADMIN_CREDIT', 'CREDIT', 'REFUND', 'INTERNAL_TRANSFER_IN', 'SWAP_IN', 'RECEIVE'];
const DEBIT = ['WITHDRAWAL', 'SEND', 'ESCROW_LOCK', 'TRADE_LOCK', 'FEE', 'PLATFORM_FEE', 'INTERNAL_TRANSFER_OUT', 'SWAP_OUT', 'DEBIT'];
const IGNORE = ['SWEEP'];
const DONE = s => ['CONFIRMED', 'COMPLETED', 'RELEASED', 'SUCCESS'].includes(String(s || '').toUpperCase());

async function chain(addr) {
  try {
    const r = await axios.get('https://api.blockcypher.com/v1/btc/main/addrs/' + addr + '/balance', { timeout: 15000 });
    return { src: 'blockcypher', received: (r.data.total_received || 0) / 1e8, sent: (r.data.total_sent || 0) / 1e8, bal: (r.data.balance || 0) / 1e8, ntx: r.data.n_tx };
  } catch (e) {
    try {
      const r = await axios.get('https://blockstream.info/api/address/' + addr, { timeout: 15000 });
      const c = r.data.chain_stats || {};
      return { src: 'blockstream', received: (c.funded_txo_sum || 0) / 1e8, sent: (c.spent_txo_sum || 0) / 1e8, bal: ((c.funded_txo_sum || 0) - (c.spent_txo_sum || 0)) / 1e8, ntx: c.tx_count };
    } catch (e2) { return { src: 'ERR', error: e.message + ' | ' + e2.message }; }
  }
}

async function auditUser(username) {
  const o = [];
  o.push('\n' + '='.repeat(78) + '\n### ' + username + '\n' + '='.repeat(78));
  const { data: u } = await supa.from('users').select('id, username, email, created_at, account_status, kyc_status, referral_earnings_btc, referred_by').ilike('username', username).maybeSingle();
  if (!u) { o.push('!! USER NOT FOUND'); return o.join('\n'); }
  o.push('user_id=' + u.id + ' | created=' + u.created_at + ' | status=' + u.account_status + ' | kyc=' + u.kyc_status + ' | referred_by=' + (u.referred_by || '-'));
  o.push('users.referral_earnings_btc = ' + f8(u.referral_earnings_btc) + ' (separate quasi-balance field)');

  const { data: wal } = await supa.from('wallets').select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt, address, updated_at').eq('user_id', u.id).maybeSingle();
  const { data: uw } = await supa.from('user_wallets').select('btc_address, last_onchain_btc, balance_btc, updated_at').eq('user_id', u.id).maybeSingle();
  const { data: ub } = await supa.from('user_balances').select('balance_btc, updated_at').eq('user_id', u.id).maybeSingle();
  const authoritative = Number(wal && wal.balance_btc || 0);
  o.push('\nBALANCES  wallets.balance_btc=' + f8(authoritative) + ' (' + usd(authoritative) + ') | locked=' + f8(wal && wal.locked_balance_btc));
  o.push('          mirrors: user_balances=' + f8(ub && ub.balance_btc) + '  user_wallets=' + f8(uw && uw.balance_btc));

  const { data: txs } = await supa.from('wallet_transactions')
    .select('id, type, currency, amount_btc, amount_usdt, status, tx_hash, idempotency_key, description, notes, created_at')
    .eq('user_id', u.id).order('created_at', { ascending: true });
  const rows = txs || [];
  const btcRows = rows.filter(t => String(t.currency || 'BTC').toUpperCase() === 'BTC');

  const byType = {};
  btcRows.forEach(t => {
    const k = String(t.type || '?').toUpperCase();
    byType[k] = byType[k] || { n: 0, sum: 0, confN: 0, confSum: 0 };
    byType[k].n++; byType[k].sum += Number(t.amount_btc || 0);
    if (DONE(t.status)) { byType[k].confN++; byType[k].confSum += Number(t.amount_btc || 0); }
  });
  o.push('\nLEDGER by type (BTC rows, total ' + btcRows.length + '):');
  Object.keys(byType).forEach(k => { const v = byType[k]; o.push('   ' + k.padEnd(16) + ' all: ' + v.n + 'x ' + f8(v.sum).padStart(13) + '  | confirmed: ' + v.confN + 'x ' + f8(v.confSum).padStart(13)); });

  const deps = btcRows.filter(t => String(t.type).toUpperCase() === 'DEPOSIT');
  const confDeps = deps.filter(t => DONE(t.status));
  const revDeps = deps.filter(t => String(t.status).toUpperCase() === 'REVERSED');
  const confDepSum = confDeps.reduce((s, t) => s + Number(t.amount_btc || 0), 0);
  o.push('\nDEPOSITS: ' + deps.length + ' rows -> ' + confDeps.length + ' CONFIRMED (sum ' + f8(confDepSum) + '), ' + revDeps.length + ' REVERSED');
  deps.forEach(d => o.push('   ' + d.created_at + ' | ' + String(d.status).padEnd(9) + ' | ' + f8(d.amount_btc) + ' | key=' + (d.idempotency_key || '(none)') + ' | ' + (d.description || d.notes || '')));
  const firstConfDep = confDeps[0];
  o.push(firstConfDep
    ? 'FIRST DEPOSIT (ledger): ' + firstConfDep.created_at + ' | ' + f8(firstConfDep.amount_btc) + ' BTC | ' + usd(firstConfDep.amount_btc)
    : 'FIRST DEPOSIT (ledger): none');

  const addr = (uw && uw.btc_address) || (wal && wal.address);
  o.push('\nON-CHAIN deposit address: ' + (addr || '(none on file)'));
  let onchain = null;
  if (addr) {
    onchain = await chain(addr);
    if (onchain.src === 'ERR') o.push('   explorer error: ' + onchain.error);
    else o.push('   [' + onchain.src + '] total_received=' + f8(onchain.received) + ' | total_sent=' + f8(onchain.sent) + ' | chain_balance=' + f8(onchain.bal) + ' | n_tx=' + onchain.ntx);
    o.push('   user_wallets.last_onchain_btc checkpoint = ' + f8(uw && uw.last_onchain_btc));
  }

  const flags = [];
  if (onchain && onchain.src !== 'ERR') {
    const delta = confDepSum - onchain.received;
    if (delta > 0.0000005) flags.push('PHANTOM DEPOSIT CREDIT: ledger CONFIRMED deposits ' + f8(confDepSum) + ' exceed on-chain received ' + f8(onchain.received) + ' by ' + f8(delta) + ' BTC (' + usd(delta) + ')');
    else if (delta < -0.0000005) o.push('   CHECK 1: on-chain received exceeds ledger deposits by ' + f8(-delta) + ' (uncredited deposit, not a double)');
    else o.push('   CHECK 1 OK: ledger CONFIRMED deposits == on-chain received (' + f8(confDepSum) + ')');
  }
  const byHash = {};
  confDeps.forEach(d => { if (d.tx_hash) { byHash[d.tx_hash] = byHash[d.tx_hash] || []; byHash[d.tx_hash].push(d.id); } });
  Object.keys(byHash).filter(h => byHash[h].length > 1).forEach(h => flags.push('DUPLICATE tx_hash credited ' + byHash[h].length + 'x: ' + h));
  const byKey = {};
  confDeps.forEach(d => { if (d.idempotency_key) { byKey[d.idempotency_key] = byKey[d.idempotency_key] || []; byKey[d.idempotency_key].push(d.id); } });
  Object.keys(byKey).filter(k => byKey[k].length > 1).forEach(k => flags.push('DUPLICATE idempotency_key credited ' + byKey[k].length + 'x: ' + k));
  for (let i = 1; i < confDeps.length; i++) {
    const a = confDeps[i - 1], b = confDeps[i];
    if (Number(a.amount_btc) === Number(b.amount_btc) && Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 15 * 60 * 1000)
      flags.push('NEAR-DUP confirmed deposits: both ' + f8(a.amount_btc) + ' BTC, ' + Math.round((new Date(b.created_at) - new Date(a.created_at)) / 1000) + 's apart (' + a.id + ', ' + b.id + ')');
  }
  const amtCount = {};
  confDeps.forEach(d => { const a = f8(d.amount_btc); amtCount[a] = (amtCount[a] || 0) + 1; });
  Object.keys(amtCount).filter(a => amtCount[a] > 1).forEach(a => o.push('   note: ' + amtCount[a] + ' CONFIRMED deposits share amount ' + a + ' BTC - inspect'));
  const refundByTrade = {};
  btcRows.filter(t => String(t.type).toUpperCase() === 'ESCROW_REFUND' && DONE(t.status)).forEach(t => {
    const m = (t.description || '').match(/#([0-9a-f]{6,})/i); const key = m ? m[1] : t.id;
    refundByTrade[key] = refundByTrade[key] || []; refundByTrade[key].push(f8(t.amount_btc));
  });
  Object.keys(refundByTrade).filter(k => refundByTrade[k].length > 1).forEach(k => flags.push('POSSIBLE DOUBLE REFUND trade #' + k + ': ' + refundByTrade[k].length + ' rows (' + refundByTrade[k].join(', ') + ')'));

  const { data: tBuy } = await supa.from('trades').select('id, status, fee_status, amount_btc, amount_usd, created_at').eq('buyer_id', u.id);
  const { data: tSell } = await supa.from('trades').select('id, status, fee_status, amount_btc, amount_usd, created_at').eq('seller_id', u.id);
  const B = tBuy || [], S = tSell || [];
  const done = arr => arr.filter(t => ['COMPLETED', 'RELEASED'].includes(String(t.status).toUpperCase()));
  const canc = arr => arr.filter(t => ['CANCELLED', 'CANCELED', 'EXPIRED', 'DISPUTED'].includes(String(t.status).toUpperCase()));
  const sum = arr => arr.reduce((s, t) => s + Number(t.amount_btc || 0), 0);
  const soldDone = sum(done(S)), boughtDone = sum(done(B));
  o.push('\nTRADES: total ' + (B.length + S.length) + '  | SELLER ' + S.length + ' (done ' + done(S).length + ', cancelled ' + canc(S).length + ')  | BUYER ' + B.length + ' (done ' + done(B).length + ', cancelled ' + canc(B).length + ')');
  o.push('   BTC delivered on completed SALES = ' + f8(soldDone) + '  (' + usd(soldDone) + ')');
  o.push('   BTC received on completed BUYS   = ' + f8(boughtDone) + '  (' + usd(boughtDone) + ')');

  let cr = 0, dr = 0; const unknown = new Set();
  btcRows.forEach(t => {
    if (!DONE(t.status)) return;
    const k = String(t.type || '?').toUpperCase(); const a = Number(t.amount_btc || 0);
    if (IGNORE.includes(k)) return;
    if (CREDIT.includes(k)) cr += a;
    else if (DEBIT.includes(k)) dr += a;
    else unknown.add(k);
  });
  const recon = cr - dr;
  const diff = authoritative - recon;
  o.push('\nRECONSTRUCTION from CONFIRMED ledger (SWEEP excluded): credits ' + f8(cr) + ' - debits ' + f8(dr) + ' = ' + f8(recon));
  o.push('   authoritative = ' + f8(authoritative) + '  |  DIFF = ' + f8(diff) + ' BTC (' + usd(Math.abs(diff)) + ')');
  if (unknown.size) o.push('   unclassified types: ' + [...unknown].join(', '));

  if (onchain && onchain.src !== 'ERR') {
    const otherCredits = cr - confDepSum;
    const expected = onchain.received + otherCredits - dr;
    o.push('   on-chain-anchored expected = received ' + f8(onchain.received) + ' + non-deposit credits ' + f8(otherCredits) + ' - debits ' + f8(dr) + ' = ' + f8(expected));
    const od = authoritative - expected;
    o.push('   vs authoritative: ' + f8(od) + ' BTC' + (Math.abs(od) > 0.0000005 ? '  <-- MISMATCH (' + usd(Math.abs(od)) + ')' : '  OK'));
    if (od > 0.0000005) flags.push('WALLET OVER by ' + f8(od) + ' BTC (' + usd(od) + ') vs on-chain-anchored expectation');
    if (od < -0.0000005) flags.push('WALLET UNDER by ' + f8(-od) + ' BTC (' + usd(-od) + ') vs on-chain-anchored expectation');
  }

  o.push('\nFLAGS: ' + (flags.length === 0 ? 'none - balance consistent with deposits, trades, and chain' : ''));
  flags.forEach(x => o.push('   !! ' + x));
  return o.join('\n');
}

(async () => {
  console.log('READ-ONLY audit @ price $' + PRICE + '/BTC  -  ' + new Date().toISOString());
  for (const name of USERS) {
    try { console.log(await auditUser(name)); }
    catch (e) { console.log('\n### ' + name + '\n  ERROR: ' + e.message); }
    await sleep(1500);
  }
  console.log('\n\n=== END (nothing written, no RPC, no deploy) ===');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
