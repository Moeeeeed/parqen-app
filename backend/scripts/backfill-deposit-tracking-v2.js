// scripts/backfill-deposit-tracking-v2.js
// ─────────────────────────────────────────────────────────────────────────────
// PART 2 / step 2.1b.
//
// For every historic DEPOSIT ledger row that has NO idempotency_key and NO
// deposit_tracking_v2 marker, resolve the on-chain transaction it represents
// (by matching amount + time + any txid fragment in the notes), then record the
// "already handled" markers so the deposit can never be credited again:
//
//   • INSERT deposit_tracking_v2 (tx_hash, address, user_id, currency, amount,
//                                 credited = true, detected_by = 'manual')
//   • UPDATE wallet_transactions SET idempotency_key = '<CCY>:<user_id>:<txid>'
//     (only where it is currently NULL)
//
// It NEVER credits anything. It NEVER touches wallets / user_balances /
// user_wallets balances / balance_audit. It only writes the two "already
// handled" markers above, and only on a HIGH-CONFIDENCE single match.
//
// A row it cannot match confidently is LEFT ALONE and printed in the UNMATCHED
// list for a human — that list is the same "who might still be owed a credit"
// question, so review it against the deposit-recovery list.
//
//   node scripts/backfill-deposit-tracking-v2.js                     # DRY RUN — writes nothing
//   node scripts/backfill-deposit-tracking-v2.js --commit            # write the markers
//   node scripts/backfill-deposit-tracking-v2.js --user Diamond79    # limit to one user (dry run)
//   node scripts/backfill-deposit-tracking-v2.js --currency USDT     # limit to one currency
//   node scripts/backfill-deposit-tracking-v2.js --limit 20          # first N ledger rows only
//
// Idempotent — safe to re-run.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const btcApiGateway = require('../services/btcApiGateway');

const argVal = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const COMMIT       = process.argv.includes('--commit');
const ONLY_USER    = argVal('--user');
const ONLY_CCY     = (argVal('--currency') || '').toUpperCase() || null;
const ROW_LIMIT    = parseInt(argVal('--limit') || '0', 10) || 0;

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const USDT_CONTRACT = process.env.TRON_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Retry transient network failures (cold DNS on this host, TronGrid 429s, etc).
async function withRetry(fn, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fn();
      if (res && res.error && /fetch failed|ETIMEDOUT|ENOTFOUND|ECONNRESET|429/i.test(res.error.message || '')) { last = res.error; }
      else return res;
    } catch (e) { last = e; }
    await sleep(1500 * (i + 1));
  }
  throw new Error(`gave up after ${tries} tries: ${last && last.message}`);
}

// Delayed exit so undici sockets close cleanly (avoids a cosmetic libuv assert
// on Windows/Node 24 from a hard process.exit()).
function finish(code) { setTimeout(() => process.exit(code), 60); }
const looksLikeTxid = h => typeof h === 'string' && /^[0-9a-fA-F]{32,64}$/.test(h.trim());

// time window: a deposit confirms on-chain, THEN gets credited (sometimes days
// later for a retroactive manual correction). So the on-chain tx should sit
// between (credit_time - 21 days) and (credit_time + 2 hours of clock skew).
const WINDOW_BEFORE_MS = 21 * 24 * 3600 * 1000;
const WINDOW_AFTER_MS  = 2 * 3600 * 1000;

function amountMatches(onchain, ledger) {
  const diff = Math.abs(onchain - ledger);
  return diff <= 1e-6 || diff / Math.max(ledger, 1e-9) <= 0.005; // 0.5% or dust
}

async function btcIncoming(addr) {
  const txs = await btcApiGateway.get(`/address/${addr}/txs`, { priority: 'low' });
  return (txs || [])
    .filter(t => t.status && t.status.confirmed)
    .map(t => ({
      txid: t.txid,
      time: (t.status.block_time || 0) * 1000,
      amount: (t.vout || []).filter(o => o.scriptpubkey_address === addr).reduce((x, o) => x + (o.value || 0), 0) / 1e8,
    }))
    .filter(t => t.amount > 0);
}

async function usdtIncoming(addr) {
  const headers = {};
  if (process.env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
  const { data } = await axios.get(`https://api.trongrid.io/v1/accounts/${addr}/transactions/trc20`, {
    headers, timeout: 25000,
    params: { contract_address: USDT_CONTRACT, limit: 50, only_to: true, order_by: 'block_timestamp,desc' },
  });
  return (data?.data || [])
    .filter(t => t.transaction_id && t.to === addr)
    .map(t => ({ txid: t.transaction_id, time: Number(t.block_timestamp || 0), amount: Number(t.value || 0) / 1e6 }));
}

(async () => {
  console.log('='.repeat(80));
  console.log(`backfill-deposit-tracking-v2  —  ${COMMIT ? '*** COMMIT (writing markers) ***' : 'DRY RUN (no writes)'}`);
  console.log(`filters: user=${ONLY_USER || 'all'}  currency=${ONLY_CCY || 'all'}  row-limit=${ROW_LIMIT || 'none'}`);
  console.log(`${new Date().toISOString()}`);
  console.log('='.repeat(80));

  // 1. ledger rows needing a marker
  let from = 0; const PAGE = 1000; let rows = [];
  while (true) {
    const { data, error } = await withRetry(() => s.from('wallet_transactions')
      .select('id, user_id, currency, amount_btc, amount_usdt, tx_hash, idempotency_key, notes, created_at')
      .eq('type', 'DEPOSIT').is('idempotency_key', null).range(from, from + PAGE - 1));
    if (error) { console.error('fetch error:', error.message); return finish(1); }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  if (ONLY_CCY) rows = rows.filter(r => r.currency === ONLY_CCY);

  // resolve usernames + addresses per user
  const userIds = [...new Set(rows.map(r => r.user_id))];
  const { data: users } = await s.from('users').select('id, username, bitcoin_wallet_address').in('id', userIds);
  const { data: uws }   = await s.from('user_wallets').select('user_id, btc_address, tron_address').in('user_id', userIds);
  const { data: wals }  = await s.from('wallets').select('user_id, address').in('user_id', userIds);
  const uMap = {}; for (const u of (users || [])) uMap[u.id] = u;
  const uwMap = {}; for (const w of (uws || [])) uwMap[w.user_id] = w;
  const walMap = {}; for (const w of (wals || [])) walMap[w.user_id] = w;

  if (ONLY_USER) {
    const wanted = (users || []).find(u =>
      u.id === ONLY_USER || (u.username || '').toLowerCase() === ONLY_USER.toLowerCase());
    rows = wanted ? rows.filter(r => r.user_id === wanted.id) : [];
    if (!wanted) console.log(`(no user matched "${ONLY_USER}")`);
  }
  rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (ROW_LIMIT) rows = rows.slice(0, ROW_LIMIT);

  console.log(`\nledger rows to resolve: ${rows.length}\n`);

  // 2. cache on-chain history per address so we fetch each address once
  const chainCache = new Map();
  async function incomingFor(ccy, addr) {
    const k = `${ccy}:${addr}`;
    if (chainCache.has(k)) return chainCache.get(k);
    let list = [];
    try {
      list = ccy === 'BTC' ? await btcIncoming(addr) : await usdtIncoming(addr);
    } catch (e) {
      console.warn(`  [chain] ${ccy} history fetch failed for ${addr.slice(0, 14)}…: ${e.message}`);
    }
    chainCache.set(k, list);
    await sleep(ccy === 'BTC' ? 200 : 700); // gateway already paces BTC; TronGrid needs the gap
    return list;
  }

  const matched = [];
  const unmatched = [];

  for (const r of rows) {
    const ccy = r.currency;
    const amt = ccy === 'BTC' ? Number(r.amount_btc || 0) : Number(r.amount_usdt || 0);
    const uw = uwMap[r.user_id] || {};
    const addr = ccy === 'BTC'
      ? (uw.btc_address || (uMap[r.user_id] || {}).bitcoin_wallet_address || (walMap[r.user_id] || {}).address)
      : uw.tron_address;
    const uname = (uMap[r.user_id] || {}).username || r.user_id.slice(0, 8);

    if (!addr) { unmatched.push({ r, uname, reason: 'no deposit address on record' }); continue; }
    if (amt <= 0) { unmatched.push({ r, uname, reason: 'ledger amount is zero' }); continue; }

    const hist = await incomingFor(ccy, addr);
    const tLedger = Date.parse(r.created_at);
    const notesHex = (r.notes || '').match(/[0-9a-fA-F]{12,64}/g) || [];

    // strongest signal: a txid fragment in the notes
    let hit = hist.find(h => notesHex.some(frag => h.txid.toLowerCase().startsWith(frag.toLowerCase())));
    let how = hit ? 'notes-txid-fragment' : null;

    // otherwise: exactly one on-chain tx that matches amount AND time window
    if (!hit) {
      const cands = hist.filter(h =>
        amountMatches(h.amount, amt) &&
        h.time >= tLedger - WINDOW_BEFORE_MS &&
        h.time <= tLedger + WINDOW_AFTER_MS);
      if (cands.length === 1) { hit = cands[0]; how = 'unique amount+time match'; }
      else if (cands.length > 1) { unmatched.push({ r, uname, addr, reason: `${cands.length} on-chain txs match amount+time (ambiguous): ` + cands.map(c => c.txid.slice(0, 12)).join(',') }); continue; }
      else { unmatched.push({ r, uname, addr, reason: `no on-chain tx matches ${amt} ${ccy} within the window (address has ${hist.length} incoming txs total)` }); continue; }
    }

    matched.push({ r, uname, addr, ccy, amt, txid: hit.txid, how });
  }

  // Two or more DISTINCT ledger rows resolving to the SAME (txid, address) means
  // the user was credited more than once for one on-chain deposit — a historic
  // double-credit. The marker back-fill de-dupes safely (unique tx_hash,address),
  // but this must be surfaced for clawback review, not silently absorbed.
  const byTxAddr = new Map();
  for (const m of matched) {
    const k = `${m.txid}|${m.addr}`;
    if (!byTxAddr.has(k)) byTxAddr.set(k, []);
    byTxAddr.get(k).push(m);
  }
  const dupGroups = [...byTxAddr.values()].filter(g => g.length > 1);

  console.log(`\n───────────────  MATCHED (${matched.length}) — markers WOULD be written  ───────────────`);
  for (const m of matched) {
    console.log(`  @${m.uname}  ${m.r.created_at}  ${m.ccy} ${m.ccy === 'BTC' ? m.amt.toFixed(8) : m.amt.toFixed(6)}`);
    console.log(`     ledger row ${m.r.id}  ->  on-chain tx ${m.txid}   [${m.how}]`);
    console.log(`     will INSERT deposit_tracking_v2(credited=true) + SET idempotency_key ${m.ccy}:${m.r.user_id}:${m.txid}`);
  }

  if (dupGroups.length) {
    console.log(`\n⚠️───────  DUPLICATE LEDGER ROWS (${dupGroups.length} group(s)) — one on-chain deposit credited MORE THAN ONCE  ───────`);
    console.log(`   The marker back-fill keeps ONE per (txid,address) and safely skips the rest,`);
    console.log(`   but each extra row below is a historic over-credit — review for clawback.\n`);
    for (const g of dupGroups) {
      console.log(`   @${g[0].uname}  ${g[0].ccy}  on-chain tx ${g[0].txid}  credited ${g.length}×:`);
      for (const m of g) console.log(`      ledger row ${m.r.id}  ${m.r.created_at}  ${m.ccy === 'BTC' ? m.amt.toFixed(8) : m.amt.toFixed(6)}  — ${(m.r.notes || '').slice(0, 60)}`);
    }
  }

  console.log(`\n───────────────  UNMATCHED (${unmatched.length}) — NOTHING written, needs a human  ───────────────`);
  for (const u of unmatched) {
    const amt = u.r.currency === 'BTC' ? Number(u.r.amount_btc).toFixed(8) : Number(u.r.amount_usdt).toFixed(6);
    console.log(`  @${u.uname}  ${u.r.created_at}  ${u.r.currency} ${amt}  (ledger row ${u.r.id})`);
    console.log(`     reason: ${u.reason}`);
    console.log(`     notes : ${(u.r.notes || '').slice(0, 90)}`);
  }

  if (!COMMIT) {
    console.log(`\nDRY RUN — nothing written. Re-run with --commit to write the ${matched.length} matched marker(s) above.`);
    return finish(0);
  }

  console.log(`\napplying ${matched.length} marker(s)…`);
  let dtvOk = 0, dtvSkip = 0, keyOk = 0, keySkip = 0, fail = 0;
  for (const m of matched) {
    // deposit_tracking_v2 marker (idempotent via unique (tx_hash,address))
    const { error: insErr } = await s.from('deposit_tracking_v2').insert({
      tx_hash: m.txid, address: m.addr, user_id: m.r.user_id, currency: m.ccy,
      amount: m.amt, credited: true, credited_at: m.r.created_at, detected_by: 'manual',
    });
    if (insErr) {
      if (/duplicate|unique/i.test(insErr.message || '')) dtvSkip++;
      else { console.error(`  FAIL dtv2 row ${m.r.id}: ${insErr.message}`); fail++; }
    } else dtvOk++;

    // ledger key (only if still NULL and the key is free)
    const key = `${m.ccy}:${m.r.user_id}:${m.txid}`;
    const { data: clash } = await s.from('wallet_transactions').select('id').eq('idempotency_key', key).limit(1);
    if (clash && clash.length) { keySkip++; }
    else {
      const { error: upErr } = await s.from('wallet_transactions')
        .update({ idempotency_key: key }).eq('id', m.r.id).is('idempotency_key', null);
      if (upErr) { console.error(`  FAIL key row ${m.r.id}: ${upErr.message}`); fail++; }
      else keyOk++;
    }
  }
  console.log(`\nDONE — deposit_tracking_v2: ${dtvOk} inserted / ${dtvSkip} already present`);
  console.log(`       idempotency_key    : ${keyOk} set / ${keySkip} already in use`);
  console.log(`       failures           : ${fail}`);
  console.log(`No balance, mirror, checkpoint, or audit row was touched.`);
  console.log(`\n⚠️  Review the ${unmatched.length} UNMATCHED row(s) above against the deposit-recovery list.`);
  return finish(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e.stack || e.message); finish(1); });
