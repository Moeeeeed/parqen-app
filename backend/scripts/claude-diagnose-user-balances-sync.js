// ============================================================================
// READ-ONLY diagnostic — why does user_balances not reflect manual updates?
//
// Answers, without writing anything:
//   1. Which Supabase key is this process actually using (service_role vs anon)?
//      A degraded-to-anon write is the #1 cause of "UPDATE succeeded but nothing
//      changed" against an RLS-protected table.
//   2. Does an RLS policy or a trigger exist on public.user_balances?
//      (via a read-only probe: attempt a no-op write in a way that surfaces the
//      PostgREST error code WITHOUT changing any value — see probeWrite below)
//   3. Full mirror-drift picture: wallets (authoritative) vs user_balances vs
//      user_wallets, for ALL users — not just the 5 in the ticket.
//   4. For the named users: every balance-bearing row + updated_at timestamps,
//      so we can see whether prior "fix" writes actually landed or silently no-op'd.
//   5. Open reconciliation_flags rows (what the integrity service has already
//      flagged and is waiting on a human for).
//
// EXPLICITLY: no .update / .insert / .delete / .rpc that changes a balance.
// The single write attempted is a deliberate lock-guaranteed no-op probe
// (set balance_btc to its OWN current value) purely to read back the error/row
// count — it cannot change a number even if it succeeds.
//
// USAGE:  node scripts/claude-diagnose-user-balances-sync.js
// ============================================================================
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || null;
const USED_KEY = SERVICE_KEY || ANON_KEY;

const f8 = n => Number(n || 0).toFixed(8);
const TOL = 0.000000011;

// crude JWT role decode (no verification — just to read the "role" claim)
function jwtRole(key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
    return payload.role || payload['role'] || '(no role claim)';
  } catch { return '(not a JWT / cannot decode)'; }
}

const NAMED = ['gh1_cryptos', 'king888', 'praqen', 'donrex', 'kingkong79-Pro'];

(async () => {
  const out = { generated_at: new Date().toISOString(), env: {}, probe: {}, named: [], drift: [], flags: [] };

  console.log('='.repeat(90));
  console.log('user_balances sync diagnostic (READ-ONLY) — ' + out.generated_at);
  console.log('='.repeat(90));

  // ---- 1. which key / role ----
  out.env = {
    supabase_url_present: !!URL,
    service_role_key_present: !!SERVICE_KEY,
    anon_key_present: !!ANON_KEY,
    key_in_use: SERVICE_KEY ? 'SERVICE_ROLE' : (ANON_KEY ? 'ANON (service role key missing!)' : 'NONE'),
    decoded_role_claim: USED_KEY ? jwtRole(USED_KEY) : '(no key)',
  };
  console.log('\n[1] Supabase auth');
  Object.entries(out.env).forEach(([k, v]) => console.log(`    ${k}: ${v}`));
  if (!SERVICE_KEY) {
    console.log('    >>> service role key is NOT set — every "fix" script that does');
    console.log('        `SERVICE_ROLE_KEY || ANON_KEY` is currently writing as ANON.');
    console.log('        Under RLS that is a silent no-op: this alone explains the symptom.');
  }

  const db = createClient(URL, USED_KEY);

  // ---- 2. read-only write probe (cannot change a value) ----
  console.log('\n[2] RLS / trigger probe on user_balances (no-op self-write, reads back row count + error)');
  try {
    const { data: sample } = await db.from('user_balances').select('user_id, balance_btc').limit(1).maybeSingle();
    if (!sample) {
      out.probe = { result: 'no rows readable in user_balances (RLS may block SELECT too, or table empty)' };
      console.log('    ' + out.probe.result);
    } else {
      const selfVal = sample.balance_btc; // write the SAME value back — guaranteed no numeric change
      const { data: probeRows, error: probeErr, status } = await db
        .from('user_balances')
        .update({ balance_btc: selfVal })
        .eq('user_id', sample.user_id)
        .eq('balance_btc', selfVal)          // extra guard: only matches if unchanged
        .select('user_id');
      out.probe = {
        target_user_id: sample.user_id.slice(0, 8) + '…',
        wrote_value: f8(selfVal) + ' (its own current value — no change possible)',
        http_status: status,
        error: probeErr ? { message: probeErr.message, code: probeErr.code, details: probeErr.details, hint: probeErr.hint } : null,
        rows_returned: Array.isArray(probeRows) ? probeRows.length : null,
        interpretation:
          probeErr ? 'write REJECTED with an error (see code/message — likely RLS policy or a trigger RAISE)'
          : (Array.isArray(probeRows) && probeRows.length === 0)
            ? 'write ACCEPTED but 0 rows affected — classic RLS silent no-op (USING clause false for this role)'
            : 'write affected the row normally — RLS/trigger are NOT blocking service-role writes; look at concurrency / another writer instead',
      };
      console.log('    ' + JSON.stringify(out.probe, null, 2).replace(/\n/g, '\n    '));
    }
  } catch (e) {
    out.probe = { exception: e.message };
    console.log('    exception: ' + e.message);
  }

  // ---- 3. full mirror drift (all users) ----
  console.log('\n[3] Full mirror drift: wallets (authoritative) vs user_balances vs user_wallets');
  const PAGE = 1000;
  async function fetchAll(table, sel) {
    let rows = [], from = 0;
    for (;;) {
      const { data, error } = await db.from(table).select(sel).range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows = rows.concat(data || []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  }
  try {
    const wallets = await fetchAll('wallets', 'user_id, balance_btc, updated_at');
    const ub = await fetchAll('user_balances', 'user_id, balance_btc, updated_at');
    const uw = await fetchAll('user_wallets', 'user_id, balance_btc, updated_at');
    const ubMap = new Map(ub.map(r => [r.user_id, r]));
    const uwMap = new Map(uw.map(r => [r.user_id, r]));
    let n = 0;
    for (const w of wallets) {
      const a = parseFloat(w.balance_btc || 0);
      const ubr = ubMap.get(w.user_id);
      const uwr = uwMap.get(w.user_id);
      const dUb = ubr ? Math.abs(a - parseFloat(ubr.balance_btc || 0)) : null;
      const dUw = uwr ? Math.abs(a - parseFloat(uwr.balance_btc || 0)) : null;
      if ((dUb != null && dUb > TOL) || (dUw != null && dUw > TOL)) {
        n++;
        out.drift.push({
          user_id: w.user_id,
          wallets_btc: f8(a), wallets_updated_at: w.updated_at,
          user_balances_btc: ubr ? f8(ubr.balance_btc) : '(no row)', user_balances_updated_at: ubr ? ubr.updated_at : null,
          user_wallets_btc: uwr ? f8(uwr.balance_btc) : '(no row)', user_wallets_updated_at: uwr ? uwr.updated_at : null,
          drift_vs_user_balances: dUb != null ? f8(dUb) : null,
          drift_vs_user_wallets: dUw != null ? f8(dUw) : null,
        });
      }
    }
    console.log(`    wallets rows: ${wallets.length} | drifting users: ${n}`);
    out.drift.slice(0, 40).forEach(d => console.log(
      `    ${d.user_id.slice(0, 8)}…  wallets=${d.wallets_btc}  user_balances=${d.user_balances_btc} (Δ${d.drift_vs_user_balances})  user_wallets=${d.user_wallets_btc} (Δ${d.drift_vs_user_wallets})`
    ));
    if (out.drift.length > 40) console.log(`    … +${out.drift.length - 40} more (see JSON)`);
  } catch (e) {
    console.log('    drift scan error: ' + e.message);
    out.drift_error = e.message;
  }

  // ---- 4. named users: detail + timestamps ----
  console.log('\n[4] Named users — balances + updated_at (did earlier fixes land?)');
  for (const uname of NAMED) {
    const { data: u } = await db.from('users').select('id, username').ilike('username', uname).maybeSingle();
    if (!u) { console.log(`    ${uname}: NOT FOUND`); out.named.push({ username: uname, found: false }); continue; }
    const [{ data: wal }, { data: ubr }, { data: uwr }] = await Promise.all([
      db.from('wallets').select('balance_btc, locked_balance_btc, updated_at').eq('user_id', u.id).maybeSingle(),
      db.from('user_balances').select('balance_btc, updated_at').eq('user_id', u.id).maybeSingle(),
      db.from('user_wallets').select('balance_btc, last_onchain_btc, updated_at').eq('user_id', u.id).maybeSingle(),
    ]);
    const rec = {
      username: uname, user_id: u.id,
      wallets_balance_btc: wal ? f8(wal.balance_btc) : '(no row)', wallets_updated_at: wal?.updated_at || null,
      user_balances_balance_btc: ubr ? f8(ubr.balance_btc) : '(no row)', user_balances_updated_at: ubr?.updated_at || null,
      user_wallets_balance_btc: uwr ? f8(uwr.balance_btc) : '(no row)', user_wallets_updated_at: uwr?.updated_at || null,
      drift_wallets_vs_user_balances: (wal && ubr) ? f8(Math.abs(parseFloat(wal.balance_btc || 0) - parseFloat(ubr.balance_btc || 0))) : null,
    };
    out.named.push(rec);
    console.log(`    ${uname}:`);
    console.log(`        wallets        = ${rec.wallets_balance_btc}  (updated ${rec.wallets_updated_at})`);
    console.log(`        user_balances  = ${rec.user_balances_balance_btc}  (updated ${rec.user_balances_updated_at})`);
    console.log(`        user_wallets   = ${rec.user_wallets_balance_btc}  (updated ${rec.user_wallets_updated_at})`);
    console.log(`        drift wallets vs user_balances = ${rec.drift_wallets_vs_user_balances}`);
  }

  // ---- 5. open reconciliation_flags ----
  console.log('\n[5] Open reconciliation_flags (MIRROR_DRIFT / RECONCILIATION_REQUIRED)');
  try {
    const { data: flags } = await db.from('reconciliation_flags')
      .select('user_id, currency, source_table, authoritative_value, mirror_value, diff, reason, status, created_at')
      .in('status', ['RECONCILIATION_REQUIRED', 'OPEN', 'PENDING'])
      .order('created_at', { ascending: false })
      .limit(100);
    out.flags = flags || [];
    console.log(`    open flags: ${out.flags.length}`);
    out.flags.slice(0, 30).forEach(fl => console.log(
      `    ${fl.created_at} | ${fl.user_id.slice(0, 8)}… | ${fl.reason}/${fl.status} | ${fl.source_table} | auth=${f8(fl.authoritative_value)} mirror=${f8(fl.mirror_value)} diff=${f8(fl.diff)}`
    ));
  } catch (e) {
    console.log('    flags query error: ' + e.message);
    out.flags_error = e.message;
  }

  const outPath = path.join(__dirname, 'claude-diagnose-user-balances-sync-result.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('\n' + '='.repeat(90));
  console.log('Diagnostic written to scripts/claude-diagnose-user-balances-sync-result.json');
  console.log('Nothing was changed. Review [1] and [2] first — they usually explain the whole symptom.');
  console.log('='.repeat(90));
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e); process.exit(1); });
