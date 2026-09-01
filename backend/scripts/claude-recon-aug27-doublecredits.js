// ============================================================================
// READ-ONLY transaction-level reconciliation of the 2026-08-27 deposit re-scan
// double-credit incident, for the 8 affected accounts.
//
// STRICTLY READ-ONLY. This script performs ONLY:
//   - supabase .select() queries (no .insert/.update/.delete, no .rpc)
//   - HTTP GET to public block explorers (blockstream.info, blockcypher.com)
// It executes NO INSERT / UPDATE / DELETE / RPC / correction / reversal / deploy.
// It preserves every row as-is. Output is a report only.
// ============================================================================
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const PRICE = 80000;
const f8 = n => Number(n || 0).toFixed(8);
const usd = n => '$' + Math.round(Number(n || 0) * PRICE).toLocaleString('en-US');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const AUG27 = '2026-08-27T00:00:00.000Z';
const AUG28 = '2026-08-28T00:00:00.000Z';
const NEAR = 0.00002; // sweep-fee tolerance for "same deposit, slightly different amount"

const USERS = ['king888', 'ukbuyer2022', 'messi_10', 'kingkong79-Pro', 'thetraderx', 'yornnguyen', 'topboy1', 'donrex'];

const txCache = {};
async function fetchTx(txid) {
  if (txCache[txid]) return txCache[txid];
  const res = { txid, blockstream: null, blockcypher: null };
  // blockstream
  try {
    const r = await axios.get('https://blockstream.info/api/tx/' + txid, { timeout: 15000 });
    res.blockstream = {
      confirmed: !!(r.data.status && r.data.status.confirmed),
      block_time: r.data.status && r.data.status.block_time ? new Date(r.data.status.block_time * 1000).toISOString() : null,
      vout: (r.data.vout || []).map(o => ({ addr: o.scriptpubkey_address, value: o.value / 1e8 })),
    };
  } catch (e) { res.blockstream = { error: (e.response && e.response.status) || e.message }; }
  await sleep(1200);
  // blockcypher
  try {
    const r = await axios.get('https://api.blockcypher.com/v1/btc/main/txs/' + txid + '?limit=50', { timeout: 15000 });
    res.blockcypher = {
      confirmed: r.data.confirmations > 0,
      confirmations: r.data.confirmations,
      block_time: r.data.confirmed || null,
      vout: (r.data.outputs || []).map(o => ({ addr: (o.addresses || [])[0], value: (o.value || 0) / 1e8 })),
    };
  } catch (e) { res.blockcypher = { error: (e.response && e.response.status) || e.message }; }
  txCache[txid] = res;
  return res;
}
function receivedToAddrs(txData, addrs) {
  const set = new Set(addrs.filter(Boolean));
  const out = {};
  ['blockstream', 'blockcypher'].forEach(src => {
    const d = txData[src];
    if (d && !d.error && d.vout) out[src] = d.vout.filter(o => set.has(o.addr)).reduce((s, o) => s + o.value, 0);
    else out[src] = null;
  });
  return out;
}

function extractTxid(row) {
  // 1: idempotency_key  BTC:<uuid>:<txid>   (txid = trailing 64-hex)
  const k = row.idempotency_key || '';
  let m = k.match(/([0-9a-fA-F]{64})/);
  if (m) return { txid: m[1], full: true, from: 'idempotency_key' };
  // 2: tx_hash column
  if (row.tx_hash && /^[0-9a-fA-F]{64}$/.test(row.tx_hash)) return { txid: row.tx_hash, full: true, from: 'tx_hash' };
  // 3: description / notes  "...deposit <hex>..." possibly truncated with ...
  const text = (row.description || '') + ' ' + (row.notes || '');
  m = text.match(/([0-9a-fA-F]{64})/);
  if (m) return { txid: m[1], full: true, from: 'description' };
  m = text.match(/([0-9a-fA-F]{8,63})\.\.\./); // truncated prefix
  if (m) return { txid: m[1], full: false, from: 'description(truncated)' };
  m = k.match(/BTC_DEPOSIT:([0-9a-fA-F]{6,})/);
  if (m) return { txid: m[1], full: false, from: 'idempotency_key(truncated)' };
  // 4: key of form BTC:<uuid>:<amount>
  m = k.match(/:(\d+\.\d+)$/);
  if (m) return { txid: null, full: false, from: 'key-is-amount:' + m[1] };
  return { txid: null, full: false, from: 'none' };
}

async function auditUser(username) {
  const L = [];
  const p = s => L.push(s);
  p('\n' + '#'.repeat(90) + '\n## ' + username + '\n' + '#'.repeat(90));

  const { data: u } = await supa.from('users').select('id, username, created_at, account_status, kyc_status').ilike('username', username).maybeSingle();
  if (!u) { p('!! NOT FOUND'); return { text: L.join('\n'), rows: [] }; }
  const { data: wal } = await supa.from('wallets').select('balance_btc, locked_balance_btc, balance_usdt, address, updated_at').eq('user_id', u.id).maybeSingle();
  const { data: uw } = await supa.from('user_wallets').select('btc_address, last_onchain_btc, balance_btc').eq('user_id', u.id).maybeSingle();
  const { data: ub } = await supa.from('user_balances').select('balance_btc').eq('user_id', u.id).maybeSingle();
  const addrs = [uw && uw.btc_address, wal && wal.address].filter(Boolean);
  const curBal = Number(wal && wal.balance_btc || 0);
  p('user_id=' + u.id + ' | created=' + u.created_at + ' | status=' + u.account_status + ' | kyc=' + u.kyc_status);
  p('deposit address(es): ' + addrs.join(', '));
  p('wallets.balance_btc = ' + f8(curBal) + ' (' + usd(curBal) + ') | locked=' + f8(wal && wal.locked_balance_btc) + ' | balance_usdt=' + f8(wal && wal.balance_usdt));
  p('mirrors: user_balances=' + f8(ub && ub.balance_btc) + '  user_wallets=' + f8(uw && uw.balance_btc));

  // ---- all ledger rows ----
  const { data: allTx } = await supa.from('wallet_transactions')
    .select('id, type, currency, amount_btc, amount_usdt, status, tx_hash, idempotency_key, description, notes, created_at, completed_at')
    .eq('user_id', u.id).order('created_at', { ascending: true });
  const rows = (allTx || []).filter(t => String(t.currency || 'BTC').toUpperCase() === 'BTC');
  const pre = rows.filter(t => t.created_at < AUG27);
  const aug27deps = rows.filter(t => t.type && t.type.toUpperCase() === 'DEPOSIT' && t.created_at >= AUG27 && t.created_at < AUG28);
  p('\nledger rows (BTC): ' + rows.length + ' total | ' + pre.length + ' pre-Aug-27 | Aug-27 DEPOSIT rows: ' + aug27deps.length);

  // ---- deposit_tracking_v2 ----
  p('\n--- deposit_tracking_v2 ---');
  try {
    const { data: dtv2, error } = await supa.from('deposit_tracking_v2').select('tx_hash, address, currency, amount, credited, credit_error, detected_by, detected_at, credited_at').eq('user_id', u.id).order('detected_at', { ascending: true });
    if (error) p('  (query error: ' + error.message + ')');
    else if (!dtv2 || !dtv2.length) p('  no rows for this user');
    else dtv2.forEach(r => p('  ' + r.detected_at + ' | ' + r.tx_hash + ' | ' + r.address + ' | ' + r.currency + ' ' + f8(r.amount) + ' | credited=' + r.credited + ' by=' + r.detected_by + (r.credit_error ? ' err=' + r.credit_error : '')));
  } catch (e) { p('  (exception: ' + e.message + ')'); }

  // ---- reconciliation_flags ----
  p('\n--- reconciliation_flags ---');
  try {
    const { data: rf, error } = await supa.from('reconciliation_flags').select('currency, source_table, authoritative_value, mirror_value, diff, reason, status, detail, created_at').eq('user_id', u.id).order('created_at', { ascending: true });
    if (error) p('  (query error: ' + error.message + ')');
    else if (!rf || !rf.length) p('  no rows for this user');
    else rf.forEach(r => p('  ' + r.created_at + ' | ' + r.reason + '/' + r.status + ' | ' + r.source_table + ' | auth=' + f8(r.authoritative_value) + ' mirror=' + f8(r.mirror_value) + ' diff=' + f8(r.diff) + (r.detail ? ' detail=' + JSON.stringify(r.detail) : '')));
  } catch (e) { p('  (exception: ' + e.message + ')'); }

  // ---- per Aug-27 deposit ----
  const results = [];
  for (const dep of aug27deps) {
    const ex = extractTxid(dep);
    p('\n' + '='.repeat(88));
    p('Aug-27 DEPOSIT row ' + dep.id);
    p('  created_at   : ' + dep.created_at);
    p('  status       : ' + dep.status);
    p('  amount_btc   : ' + f8(dep.amount_btc) + '  (' + usd(dep.amount_btc) + ')');
    p('  idempotency  : ' + (dep.idempotency_key || '(none)'));
    p('  description  : ' + (dep.description || dep.notes || ''));
    p('  TXID         : ' + (ex.txid || '(unresolved)') + '  [' + ex.from + (ex.full ? '' : ', PARTIAL') + ']');

    // on-chain, 2 sources
    let onchainAmt = null, ocLines = [];
    if (ex.txid && ex.full) {
      const td = await fetchTx(ex.txid);
      const rec = receivedToAddrs(td, addrs);
      const bs = td.blockstream, bc = td.blockcypher;
      ocLines.push('    blockstream : ' + (bs && bs.error ? 'ERR ' + bs.error : ('confirmed=' + bs.confirmed + ' time=' + bs.block_time + ' -> to user addr = ' + (rec.blockstream == null ? 'n/a' : f8(rec.blockstream)))));
      ocLines.push('    blockcypher : ' + (bc && bc.error ? 'ERR ' + bc.error : ('confs=' + bc.confirmations + ' time=' + bc.block_time + ' -> to user addr = ' + (rec.blockcypher == null ? 'n/a' : f8(rec.blockcypher)))));
      const vals = [rec.blockstream, rec.blockcypher].filter(v => v != null && v > 0);
      if (vals.length) {
        onchainAmt = vals[0];
        if (vals.length === 2 && Math.abs(vals[0] - vals[1]) > 1e-8) ocLines.push('    !! sources disagree: ' + f8(vals[0]) + ' vs ' + f8(vals[1]));
        else if (vals.length === 2) ocLines.push('    two-source agreement: ' + f8(onchainAmt));
        else ocLines.push('    single-source only: ' + f8(onchainAmt));
      } else {
        ocLines.push('    !! no output to this user address found on either source');
      }
    } else {
      ocLines.push('    (txid not fully resolved from ledger row — on-chain lookup skipped; see PARTIAL note)');
    }
    p('  on-chain verification:');
    ocLines.forEach(x => p(x));

    // pre-Aug-27 evidence of same deposit
    p('  pre-Aug-27 evidence search:');
    const shortId = ex.txid ? ex.txid.slice(0, 12) : null;
    const matches = [];
    pre.forEach(r => {
      const hay = ((r.tx_hash || '') + ' ' + (r.description || '') + ' ' + (r.notes || '') + ' ' + (r.idempotency_key || '')).toLowerCase();
      let why = null;
      if (ex.txid && hay.includes(ex.txid.toLowerCase())) why = 'FULL TXID match';
      else if (shortId && hay.includes(shortId.toLowerCase())) why = 'txid-prefix match';
      else if (Math.abs(Number(r.amount_btc || 0) - Number(dep.amount_btc || 0)) < 1e-9 && ['DEPOSIT'].includes((r.type || '').toUpperCase())) why = 'exact amount DEPOSIT';
      else if (Math.abs(Number(r.amount_btc || 0) - Number(dep.amount_btc || 0)) <= NEAR && ['DEPOSIT', 'SWEEP'].includes((r.type || '').toUpperCase())) why = 'near amount (' + f8(Math.abs(Number(r.amount_btc) - Number(dep.amount_btc))) + ' off) ' + (r.type || '').toUpperCase();
      if (why) matches.push({ r, why });
    });
    if (!matches.length) p('    NONE FOUND — Aug-27 credit appears to be first credit of this deposit (legitimate)');
    matches.forEach(({ r, why }) => p('    [' + why + '] ' + r.created_at + ' | ' + r.type + ' | ' + f8(r.amount_btc) + ' | status=' + r.status + ' | key=' + (r.idempotency_key || '(none)') + ' | ' + (r.description || r.notes || '').slice(0, 120)));

    // classify
    const confirmedPriorCredit = matches.filter(m => ['DEPOSIT'].includes((m.r.type || '').toUpperCase()) && ['CONFIRMED', 'COMPLETED'].includes((m.r.status || '').toUpperCase()));
    const reversedPrior = matches.filter(m => (m.r.status || '').toUpperCase() === 'REVERSED');
    const origCredit = confirmedPriorCredit.reduce((s, m) => s + Number(m.r.amount_btc || 0), 0);
    const aug27Credit = ['CONFIRMED', 'COMPLETED'].includes((dep.status || '').toUpperCase()) ? Number(dep.amount_btc || 0) : 0;
    let dup = 0, verdict;
    if (aug27Credit === 0) { verdict = 'Aug-27 row not in a credited state (' + dep.status + ') — no duplication from it'; }
    else if (confirmedPriorCredit.length) { dup = Math.min(aug27Credit, origCredit > 0 ? Math.max(origCredit, aug27Credit) : aug27Credit); dup = aug27Credit; verdict = 'DUPLICATE — prior CONFIRMED credit exists; Aug-27 credit of ' + f8(aug27Credit) + ' is a re-credit'; }
    else if (reversedPrior.length && !confirmedPriorCredit.length) { verdict = 'NOT duplicate — only prior match is REVERSED (dup-log); Aug-27 is the real credit'; }
    else { verdict = 'NOT duplicate — no prior credit found'; }
    p('  --> ' + verdict);
    p('  --> on-chain amount=' + (onchainAmt != null ? f8(onchainAmt) : 'UNVERIFIED') + ' | original credit=' + f8(origCredit) + ' | Aug-27 credit=' + f8(aug27Credit) + ' | DUPLICATE=' + f8(dup) + ' (' + usd(dup) + ')');

    results.push({
      user: username, txid: ex.txid || ('(' + ex.from + ')'), txidFull: ex.full,
      onchain: onchainAmt, origCredit, aug27Credit, dup,
      depRowId: dep.id, depStatus: dep.status, createdAt: dep.created_at,
    });
  }

  // ---- downstream activity since first Aug-27 credit ----
  const firstAug27 = aug27deps.map(d => d.created_at).sort()[0];
  p('\n' + '='.repeat(88));
  p('DOWNSTREAM activity at/after first Aug-27 credit (' + (firstAug27 || 'n/a') + '):');
  const DOWN_TYPES = ['TRANSFER_IN', 'TRANSFER_OUT', 'SWAP', 'ESCROW_RELEASE', 'WITHDRAWAL', 'SEND'];
  const downRows = rows.filter(r => firstAug27 && r.created_at >= firstAug27 && DOWN_TYPES.includes((r.type || '').toUpperCase()));
  if (!downRows.length) p('  none');
  const downByType = {};
  downRows.forEach(r => {
    const k = (r.type || '').toUpperCase();
    downByType[k] = downByType[k] || { n: 0, sum: 0, confSum: 0 };
    downByType[k].n++; downByType[k].sum += Number(r.amount_btc || 0);
    if (['CONFIRMED', 'COMPLETED', 'RELEASED', 'SUCCESS'].includes((r.status || '').toUpperCase())) downByType[k].confSum += Number(r.amount_btc || 0);
    p('  ' + r.created_at + ' | ' + k.padEnd(14) + ' | ' + f8(r.amount_btc) + ' | ' + r.status + ' | ' + (r.description || r.notes || '').slice(0, 90));
  });
  p('  downstream totals: ' + Object.keys(downByType).map(k => k + '=' + f8(downByType[k].confSum) + '(' + downByType[k].n + ')').join('  '));
  // external outflow that could carry phantom funds off-platform
  const extOut = ['WITHDRAWAL', 'SEND', 'TRANSFER_OUT', 'SWAP'].reduce((s, k) => s + ((downByType[k] && downByType[k].confSum) || 0), 0);
  p('  external/irreversible outflow since Aug-27 (WITHDRAWAL+SEND+TRANSFER_OUT+SWAP, confirmed): ' + f8(extOut) + ' (' + usd(extOut) + ')');

  const totalDup = results.reduce((s, r) => s + r.dup, 0);
  const recoverable = Math.min(totalDup, curBal);
  p('\n  USER TOTALS: duplicate=' + f8(totalDup) + ' (' + usd(totalDup) + ') | current wallet=' + f8(curBal) + ' | recoverable(min of the two)=' + f8(recoverable) + ' (' + usd(recoverable) + ')');
  if (extOut > 0) p('  NOTE: ' + f8(extOut) + ' left via withdrawal/send/transfer/swap since Aug-27 — trace whether phantom or honest funds; may reduce recoverable.');

  return { text: L.join('\n'), rows: results, curBal, totalDup, recoverable, extOut };
}

(async () => {
  console.log('READ-ONLY Aug-27 double-credit reconciliation — ' + new Date().toISOString() + ' — price $' + PRICE + '/BTC');
  console.log('NO writes, NO RPC, NO reversal. Report only.\n');
  const all = [];
  for (const name of USERS) {
    try { const r = await auditUser(name); console.log(r.text); all.push({ name, ...r }); }
    catch (e) { console.log('\n## ' + name + '  ERROR: ' + e.message + '\n' + e.stack); }
    await sleep(1500);
  }

  console.log('\n\n' + '='.repeat(120));
  console.log('FINAL TABLE');
  console.log('='.repeat(120));
  const H = ['user', 'deposit TXID', 'on-chain', 'orig credit', 'Aug-27 credit', 'duplicate', 'downstream ext-out', 'recoverable'];
  console.log(H.join(' | '));
  console.log('-'.repeat(120));
  all.forEach(u => {
    (u.rows || []).forEach((r, i) => {
      const dl = i === 0 ? f8(u.extOut) : '';
      const rc = i === 0 ? f8(u.recoverable) : '';
      console.log([
        r.user,
        (r.txidFull ? r.txid : r.txid + ' [partial]'),
        r.onchain != null ? f8(r.onchain) : 'UNVERIFIED',
        f8(r.origCredit),
        f8(r.aug27Credit),
        f8(r.dup),
        dl,
        rc,
      ].join(' | '));
    });
    console.log('-'.repeat(120));
  });
  const gDup = all.reduce((s, u) => s + (u.totalDup || 0), 0);
  const gRec = all.reduce((s, u) => s + (u.recoverable || 0), 0);
  const gExt = all.reduce((s, u) => s + (u.extOut || 0), 0);
  console.log('TOT&nbsp;'.replace('&nbsp;', ' ') + 'duplicate = ' + f8(gDup) + ' (' + usd(gDup) + ') | recoverable = ' + f8(gRec) + ' (' + usd(gRec) + ') | ext-outflow since Aug-27 = ' + f8(gExt) + ' (' + usd(gExt) + ')');
  console.log('\n=== END — nothing written, no RPC, no deploy. Awaiting approval. ===');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
