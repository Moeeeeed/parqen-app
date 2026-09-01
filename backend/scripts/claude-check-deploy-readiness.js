// ============================================================================
// READ-ONLY deployment-readiness + deposit-health probe.
// SELECT-only + three side-effect-free rpc existence probes (bogus all-zero
// UUID -> the function, if it exists, raises internally and rolls back; if it
// doesn't exist PostgREST returns PGRST202 before any logic runs). No writes.
//   node scripts/claude-check-deploy-readiness.js
// ============================================================================
'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const ANON = process.env.SUPABASE_ANON_KEY || null;
const db = createClient(URL, SVC || ANON);
const ZERO = '00000000-0000-0000-0000-000000000000';
const f8 = n => Number(n || 0).toFixed(8);
const hr = () => console.log('-'.repeat(88));

function jwtRole(k){ try { return JSON.parse(Buffer.from(k.split('.')[1],'base64').toString()).role; } catch { return '?'; } }

async function rpcExists(name, args) {
  const { error } = await db.rpc(name, args);
  if (!error) return { name, exists: true, note: 'returned OK (unexpected for zero-uuid, but means it exists)' };
  if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) return { name, exists: false, note: error.message };
  return { name, exists: true, note: `exists — raised: ${error.code || ''} ${error.message}` };
}

async function tableInfo(name, cols='*') {
  const { data, error, count } = await db.from(name).select(cols, { count: 'exact', head: false }).limit(1);
  if (error) return { name, ok: false, note: `${error.code || ''} ${error.message}` };
  return { name, ok: true, count, sample: data && data[0] };
}

async function fetchAll(table, sel, filt) {
  let rows=[], from=0; const P=1000;
  for(;;){ let q=db.from(table).select(sel).range(from,from+P-1); if(filt) q=filt(q);
    const {data,error}=await q; if(error){ console.log(`  ${table} page err: ${error.message}`); break; }
    rows=rows.concat(data||[]); if(!data||data.length<P) break; from+=P; }
  return rows;
}

(async () => {
  console.log('='.repeat(88));
  console.log('PRAQEN deploy-readiness / deposit-health  (READ-ONLY)  ' + new Date().toISOString());
  console.log('='.repeat(88));

  console.log('\n[1] ENV / auth');
  console.log(`    SUPABASE_URL           : ${URL}`);
  console.log(`    service_role key set   : ${!!SVC}  (decoded role: ${SVC ? jwtRole(SVC) : 'n/a'})`);
  console.log(`    anon key set           : ${!!ANON}`);
  console.log(`    NODE_ENV               : ${process.env.NODE_ENV}`);
  console.log(`    START_SERVICES         : ${process.env.START_SERVICES}`);
  console.log(`    DISABLE_DEPOSIT_MONITOR: ${process.env.DISABLE_DEPOSIT_MONITOR}`);
  console.log(`    monitors will start?   : ${(process.env.DISABLE_DEPOSIT_MONITOR!=='true' && (process.env.NODE_ENV==='production'||process.env.START_SERVICES==='true')) ? 'YES' : 'NO'}`);
  console.log(`    TRONGRID_API_KEY set   : ${!!process.env.TRONGRID_API_KEY}`);
  console.log(`    EMAIL_USER/PASS set    : ${!!process.env.EMAIL_USER}/${!!process.env.EMAIL_PASS}  (deposit e-mails use nodemailer 'gmail' service)`);
  console.log(`    SMTP_* set             : ${!!process.env.SMTP_HOST}`);
  console.log(`    TWILIO_SID set         : ${!!process.env.TWILIO_SID}  (deposit SMS)`);
  console.log(`    kill switches          : SENDS_DISABLED=${process.env.SENDS_DISABLED} USDT_SENDS_DISABLED=${process.env.USDT_SENDS_DISABLED} BTC_TO_USDT_SWAP_DISABLED=${process.env.BTC_TO_USDT_SWAP_DISABLED}`);

  console.log('\n[2] Atomic money RPCs present in live DB? (the 2026-08-25 migration)');
  for (const r of [
    await rpcExists('praqen_credit_deposit',   { p_user_id: ZERO, p_currency: 'BTC', p_amount: 0.001, p_onchain_balance: 0.001, p_idempotency_key: 'readonly-probe', p_note: 'probe' }),
    await rpcExists('praqen_internal_transfer', { p_sender_id: ZERO, p_recipient_id: ZERO, p_currency: 'BTC', p_amount: 0.001, p_idempotency_key: 'readonly-probe', p_note: 'probe' }),
    await rpcExists('praqen_reject_withdrawal', { p_tx_id: ZERO, p_ceo_id: ZERO, p_reason: 'probe' }),
  ]) console.log(`    ${r.exists ? 'PRESENT ' : 'MISSING '} ${r.name}  — ${r.note}`);

  console.log('\n[3] Deposit-tracking / reconciliation tables');
  for (const t of ['deposit_tracking_v2', 'deposit_tracking', 'reconciliation_flags', 'balance_audit']) {
    const i = await tableInfo(t);
    console.log(`    ${i.ok ? 'OK  ' : 'ERR '} ${t.padEnd(22)} rows=${i.ok ? i.count : '-'} ${i.ok ? '' : '('+i.note+')'}`);
  }

  console.log('\n[4] deposit_tracking_v2 — credited vs stuck');
  const dtv2 = await fetchAll('deposit_tracking_v2', 'currency, credited, credit_error, amount, detected_by, detected_at, user_id, tx_hash');
  if (dtv2.length) {
    const by = {};
    for (const r of dtv2) { const k = `${r.currency} credited=${r.credited}`; by[k] = (by[k]||0)+1; }
    Object.entries(by).forEach(([k,v]) => console.log(`    ${k}: ${v}`));
    const stuck = dtv2.filter(r => !r.credited);
    console.log(`    UNCREDITED rows: ${stuck.length}`);
    stuck.slice(0, 25).forEach(r => console.log(`      ${r.detected_at} | ${r.currency} | ${r.amount} | user ${String(r.user_id).slice(0,8)} | err=${r.credit_error || '(none - pending retry)'} | tx ${String(r.tx_hash).slice(0,14)}`));
  } else {
    console.log('    (no rows — table empty or missing)');
  }

  console.log('\n[5] reconciliation_flags — open items by reason');
  const flags = await fetchAll('reconciliation_flags', 'currency, reason, status, diff, created_at, user_id, detail');
  if (flags.length) {
    const open = flags.filter(f => ['RECONCILIATION_REQUIRED','INVESTIGATING','OPEN','PENDING'].includes(f.status));
    const by = {};
    for (const f of open) { const k = `${f.reason} / ${f.currency}`; by[k] = (by[k]||0)+1; }
    console.log(`    total flags: ${flags.length} | open: ${open.length}`);
    Object.entries(by).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`      ${k}: ${v}`));
    open.slice(0, 20).forEach(f => console.log(`      ${f.created_at} | ${f.reason} | ${f.currency} | diff=${f.diff} | user ${String(f.user_id).slice(0,8)} | ${JSON.stringify(f.detail).slice(0,120)}`));
  } else {
    console.log('    (no rows)');
  }

  console.log('\n[6] Monitored-address coverage');
  const uw = await fetchAll('user_wallets', 'user_id, btc_address, tron_address, balance_btc, last_onchain_btc, last_onchain_usdt, updated_at');
  const withBtc  = uw.filter(w => w.btc_address && w.btc_address !== '');
  const withTron = uw.filter(w => w.tron_address && w.tron_address !== '');
  console.log(`    user_wallets rows          : ${uw.length}`);
  console.log(`    with btc_address (BTC mon) : ${withBtc.length}`);
  console.log(`    with tron_address (USDT mon): ${withTron.length}`);
  console.log(`    missing tron_address       : ${uw.length - withTron.length}  (these users' USDT deposits are NOT watched)`);

  console.log('\n[7] Mirror drift — wallets (authoritative) vs user_balances vs user_wallets  [BTC]');
  const wal = await fetchAll('wallets', 'user_id, balance_btc, balance_usdt, updated_at');
  const ub  = await fetchAll('user_balances', 'user_id, balance_btc, updated_at');
  const ubM = new Map(ub.map(r => [r.user_id, r]));
  const uwM = new Map(uw.map(r => [r.user_id, r]));
  const TOL = 0.000000011;
  let driftUB = 0, driftUW = 0, sumAbsUB = 0, worst = [];
  for (const w of wal) {
    const a = parseFloat(w.balance_btc || 0);
    const b = ubM.has(w.user_id) ? parseFloat(ubM.get(w.user_id).balance_btc || 0) : null;
    const c = uwM.has(w.user_id) ? parseFloat(uwM.get(w.user_id).balance_btc || 0) : null;
    const dB = b == null ? null : Math.abs(a - b);
    const dW = c == null ? null : Math.abs(a - c);
    if (dB != null && dB > TOL) { driftUB++; sumAbsUB += dB; worst.push({ u: w.user_id, a, b, c, d: dB }); }
    if (dW != null && dW > TOL) driftUW++;
  }
  console.log(`    wallets rows: ${wal.length} | user_balances rows: ${ub.length}`);
  console.log(`    drift vs user_balances: ${driftUB} users, total |Δ| = ${f8(sumAbsUB)} BTC`);
  console.log(`    drift vs user_wallets : ${driftUW} users`);
  worst.sort((x,y)=>y.d-x.d).slice(0,15).forEach(x =>
    console.log(`      ${x.u.slice(0,8)} wallets=${f8(x.a)} user_balances=${f8(x.b)} user_wallets=${x.c==null?'-':f8(x.c)} Δ=${f8(x.d)}`));

  hr();
  console.log('Interpretation:');
  console.log(' - [2] any MISSING => that whole class of operation is failing live (deposits/transfers).');
  console.log(' - [4] UNCREDITED rows with an err => deposits detected but not landing in wallets.');
  console.log(' - [5] UNCREDITED_ONCHAIN_DEPOSIT flags => real coins on-chain, never credited.');
  console.log(' - [6] missing tron_address => USDT deposits for those users cannot be detected at all.');
  console.log(' - [7] drift => wallets is right; the mirror the UI/old code reads is stale.');
  hr();
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e); process.exit(1); });
