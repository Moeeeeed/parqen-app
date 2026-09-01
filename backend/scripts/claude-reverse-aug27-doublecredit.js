// ============================================================================
// REVERSAL — 2026-08-27 deposit re-scan double-credit incident (8 accounts)
//
// Follows claude-recon-aug27-doublecredits.js / -followup.js (READ-ONLY audits)
// and mirrors the prior reversal precedent reverse-hidil55555-dup-deposit.js:
//   - pin EXACT duplicate wallet_transactions row ids per user
//   - assert each row is DEPOSIT / Aug-27 / still in a credited state BEFORE touching it
//   - mark them status = 'REVERSED' + append a bracketed [REVERSED: ...] note
// PLUS (this incident inflated the actual balance, hidil55555 did not):
//   - debit the summed phantom BTC from wallets.balance_btc  (optimistic-locked,
//     same compare-and-swap style as claude-credit-two-missed-deposits.js)
//   - keep the mirrors consistent: user_balances.balance_btc, user_wallets.balance_btc
//   - write a balance_audit stamp (change_btc = -phantom, new_balance = live post-debit)
//     so the swap-safety check (_assertLedgerTrueBtc) does not fire a false mismatch
//     — this is the exact gap correct-audit-trail-gap-king888-kingkong79.js patched.
//
// DELIBERATELY NOT TOUCHED:
//   - user_wallets.last_onchain_btc  (leaving it high is what PREVENTS the
//     re-scan from re-crediting the same arrival a third time — lowering it
//     would re-arm the bug)
//   - any on-chain send / sweep
//
// SAFETY MODEL:
//   - DRY RUN by default. Writes only with --apply.
//   - Refuses any user whose dupRowIds is empty (no auto-reversal of real money).
//     Run dry (default) first: it prints a SUGGESTED id list per user from the
//     recon logic — you verify those against the recon output, paste them into
//     PLAN below, then re-run dry, then --apply.
//   - Per user, computes phantom = sum(amount_btc of the pinned rows) and
//     asserts it matches expectedPhantomBtc (tol 1e-8, or 5e-4 if approx:true).
//     Mismatch => that user is SKIPPED, never guessed.
//   - Never drives a balance negative. If phantom > live balance (funds already
//     spent/withdrawn/swapped — the recon flags ext-outflow for some users),
//     the user is SKIPPED and reported for manual handling unless
//     --on-shortfall=clamp is passed (then it debits only what's there and logs
//     the residual).
//   - Idempotent: a row already 'REVERSED' is skipped; the debit is
//     optimistic-locked on the exact pre-read balance, so a re-run or a
//     concurrent process cannot double-debit.
//   - Batches of 2 (override --batch-size=N). After each batch it re-reads and
//     prints old -> new wallets.balance_btc for that batch's users.
//   - Per-user best-effort rollback: if a step fails partway, it reverts the
//     row-status and balance changes it already made for THAT user, then aborts
//     the whole run.
//   - Writes a full JSON run log to scripts/2026-08-27-reversal-doublecredit-<mode>-<ts>.json
//
// USAGE:
//   node scripts/claude-reverse-aug27-doublecredit.js                 # dry run, all 8
//   node scripts/claude-reverse-aug27-doublecredit.js --only=king888  # dry run, one user
//   node scripts/claude-reverse-aug27-doublecredit.js --apply         # real writes (after IDs filled in)
//   node scripts/claude-reverse-aug27-doublecredit.js --apply --batch-size=2 --on-shortfall=skip
// ============================================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ---- args -------------------------------------------------------------------
const ARGV = process.argv.slice(2);
const APPLY = ARGV.includes('--apply');
const arg = (name, def) => {
  const hit = ARGV.find(a => a.startsWith(name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const BATCH_SIZE = Math.max(1, parseInt(arg('--batch-size', '2'), 10) || 2);
const ON_SHORTFALL = arg('--on-shortfall', 'skip'); // 'skip' | 'clamp'
const ONLY = (arg('--only', '') || '').split(',').map(s => s.trim()).filter(Boolean);

// ---- incident constants ---------------------------------------------------
const PRICE = 80000;
const AUG27 = '2026-08-27T00:00:00.000Z';
const AUG28 = '2026-08-28T00:00:00.000Z';
const EXACT_TOL = 1e-8;
const APPROX_TOL = 5e-4;
const CREDITED_STATES = ['CONFIRMED', 'COMPLETED'];
const f8 = n => Number(n || 0).toFixed(8);
const usd = n => '$' + Math.round(Number(n || 0) * PRICE).toLocaleString('en-US');
const nowIso = () => new Date().toISOString();

// ===========================================================================
// PLAN — one entry per affected user.
//
//   dupRowIds: []  <-- MUST be filled with the exact wallet_transactions.id of
//                      the Aug-27 DUPLICATE DEPOSIT row(s) for that user, taken
//                      from the recon output. Empty = user is skipped under --apply.
//
//   expectedPhantomBtc / approx: the figures from the investigation summary.
//   `approx: true` (the "~" rows: ukbuyer2022, topboy1, kingkong79-Pro) widens
//   the reconcile tolerance to 5e-4; the actual debit is ALWAYS the summed
//   amount_btc of the pinned rows, never this number.
// ===========================================================================
const PLAN = [
  {
    username: 'king888', userId: '3c4f8383-85b4-4099-9bae-c67ed9345cd9',
    expectedPhantomBtc: 0.03478385, approx: false,
    dupRowIds: [
      'cbfa94e9-b39d-480b-bb55-f430ed7a2d32',
      '96203355-d021-40b6-867a-88407ad12981',
      'fc238cfb-5dd0-432c-8544-3445e667ae6a',
    ],
  },
  {
    username: 'ukbuyer2022', userId: '19563f83-e4dd-468e-8bfe-47220cc23bb0',
    expectedPhantomBtc: 0.0352, approx: true,
    dupRowIds: [
      '4b3bc554-0f86-4a60-8036-757ccd941687',
      '248b57ca-e3d8-4000-b62d-445ae950824a',
      '8358bd87-c3a0-4ca5-932a-f7e6ec0a22fd',
      '628f99ab-df4a-48f9-9689-b9f91235762d',
      '43a6caa5-a4c5-4e3f-9d32-38e66d9f593c',
      '2cd184cc-1896-4d78-a4cc-97678252db6d',
    ],
  },
  {
    username: 'messi_10', userId: 'c4eac002-346e-4fc2-a851-45e6e69004e3',
    expectedPhantomBtc: 0.01570389, approx: false,
    dupRowIds: [
      '26c57104-c586-475e-8ecb-11b4b0d7385b',
    ],
  },
  {
    username: 'thetraderx', userId: 'da5d1c27-c714-4eff-8d0f-7a729144c0b5',
    expectedPhantomBtc: 0.00767100, approx: false,
    dupRowIds: [
      '37092caa-b1c2-4d10-8d3a-7b7503b7a966',
    ],
  },
  {
    username: 'yornnguyen', userId: '695d7e05-999f-4264-9952-5ae6730de32a',
    expectedPhantomBtc: 0.00769245, approx: false,
    dupRowIds: [
      '5e8d516b-fd59-4238-8dd1-57d3517284ce',
      '052cf7b8-89f9-45fc-8854-28458d39ed24',
    ],
  },
  {
    username: 'topboy1', userId: '3f769be8-7dde-4520-b0e0-1d9e8a997a04',
    expectedPhantomBtc: 0.01014756, approx: true,
    dupRowIds: [
      '04c2db01-8a95-4d91-a42c-bd699349e9d6',
      'b985ede6-bb54-411d-ab40-66114bedcbba',
    ],
  },
  {
    username: 'donrex', userId: 'a1a39e28-cd97-4e2a-b6a3-1ec5175fc332',
    expectedPhantomBtc: 0.00347007, approx: false,
    dupRowIds: [
      '9e64c5dd-3a7c-4eef-b8a1-1bae6605f1b2',
    ],
  },
  {
    username: 'kingkong79-Pro', userId: 'e8d3d037-554b-4b09-b8f7-373f03de10de',
    expectedPhantomBtc: 0.01074039, approx: true,
    dupRowIds: [
      'c1662ff1-de67-4456-9f3b-61d44f29f2b6',
      'b8371833-5182-460a-ad85-f474bb8619cf',
      'eb52a6b8-66ff-4448-a11a-17e0b3a45073',
      '499e747b-6d93-46c3-aea1-f4f86fbaa1cb',
      '9f5fbf36-9952-4917-9167-6163c785793f',
      'b2a04122-ddf0-4d90-a3f2-2041bfca8d0b',
      'ac79fb22-47b6-4ac9-9ab4-244307243b6a',
    ],
  },
];

// ---------------------------------------------------------------------------
// txid extraction + duplicate detection — same logic as the recon script, so
// the SUGGESTED id list here matches what the audit classified as DUPLICATE.
// ---------------------------------------------------------------------------
function extractTxid(row) {
  const k = row.idempotency_key || '';
  let m = k.match(/([0-9a-fA-F]{64})/);
  if (m) return m[1];
  if (row.tx_hash && /^[0-9a-fA-F]{64}$/.test(row.tx_hash)) return row.tx_hash;
  const text = (row.description || '') + ' ' + (row.notes || '');
  m = text.match(/([0-9a-fA-F]{64})/);
  if (m) return m[1];
  return null;
}

async function loadUser(p) {
  const { data: u } = await db.from('users')
    .select('id, username, account_status').ilike('username', p.username).maybeSingle();
  const { data: wal } = await db.from('wallets')
    .select('balance_btc, locked_balance_btc').eq('user_id', p.userId).maybeSingle();
  const { data: ub } = await db.from('user_balances')
    .select('balance_btc').eq('user_id', p.userId).maybeSingle();
  const { data: uw } = await db.from('user_wallets')
    .select('balance_btc, btc_address, last_onchain_btc').eq('user_id', p.userId).maybeSingle();
  const { data: allTx } = await db.from('wallet_transactions')
    .select('id, type, currency, amount_btc, status, tx_hash, idempotency_key, description, notes, created_at')
    .eq('user_id', p.userId).order('created_at', { ascending: true });
  const rows = (allTx || []).filter(t => String(t.currency || 'BTC').toUpperCase() === 'BTC');
  return {
    dbUser: u,
    wallets_balance_btc: wal ? parseFloat(wal.balance_btc || 0) : null,
    user_balances_balance_btc: ub ? parseFloat(ub.balance_btc || 0) : null,
    user_wallets_balance_btc: uw ? parseFloat(uw.balance_btc || 0) : null,
    rows,
  };
}

// Conservative: only suggests an Aug-27 DEPOSIT row as duplicate when there is a
// prior CONFIRMED/COMPLETED DEPOSIT row with the SAME FULL TXID (strong match).
function suggestDupRowIds(rows) {
  const pre = rows.filter(r => r.created_at < AUG27);
  const aug27deps = rows.filter(r =>
    (r.type || '').toUpperCase() === 'DEPOSIT' &&
    r.created_at >= AUG27 && r.created_at < AUG28 &&
    CREDITED_STATES.includes((r.status || '').toUpperCase())
  );
  const out = [];
  for (const dep of aug27deps) {
    const txid = extractTxid(dep);
    if (!txid) continue;
    const priorSameTxid = pre.some(r => {
      if ((r.type || '').toUpperCase() !== 'DEPOSIT') return false;
      if (!CREDITED_STATES.includes((r.status || '').toUpperCase())) return false;
      const hay = ((r.tx_hash || '') + ' ' + (r.description || '') + ' ' + (r.notes || '') + ' ' + (r.idempotency_key || '')).toLowerCase();
      return hay.includes(txid.toLowerCase());
    });
    if (priorSameTxid) out.push({ id: dep.id, amount_btc: parseFloat(dep.amount_btc || 0), txid, created_at: dep.created_at });
  }
  return out;
}

// ---------------------------------------------------------------------------
// validate the pinned rows for one user
// ---------------------------------------------------------------------------
function validatePinnedRows(p, snap) {
  const problems = [];
  const targets = [];
  const seen = new Set();
  for (const id of p.dupRowIds) {
    if (seen.has(id)) { problems.push(`row ${id} listed twice in dupRowIds`); continue; }
    seen.add(id);
    const row = snap.rows.find(r => r.id === id);
    if (!row) { problems.push(`row ${id} not found for this user`); continue; }
    const st = (row.status || '').toUpperCase();
    const rowProblems = [];
    if ((row.type || '').toUpperCase() !== 'DEPOSIT') rowProblems.push(`row ${id} type is ${row.type}, expected DEPOSIT`);
    if (!(row.created_at >= AUG27 && row.created_at < AUG28)) rowProblems.push(`row ${id} created_at ${row.created_at} is not on 2026-08-27`);
    if (st === 'REVERSED') rowProblems.push(`row ${id} already REVERSED (likely already processed — remove it from dupRowIds if intentional)`);
    else if (!CREDITED_STATES.includes(st)) rowProblems.push(`row ${id} status is ${row.status}, expected CONFIRMED/COMPLETED`);
    if (rowProblems.length) { problems.push(...rowProblems); continue; }
    targets.push(row);
  }
  const computedPhantom = parseFloat(f8(targets.reduce((s, r) => s + parseFloat(r.amount_btc || 0), 0)));
  const tol = p.approx ? APPROX_TOL : EXACT_TOL;
  const reconOk = Math.abs(computedPhantom - p.expectedPhantomBtc) <= tol;
  if (!reconOk) {
    problems.push(
      `phantom mismatch: pinned rows sum to ${f8(computedPhantom)} but expectedPhantomBtc is ${f8(p.expectedPhantomBtc)} ` +
      `(tol ${tol}${p.approx ? ', approx' : ''})`
    );
  }
  return { targets, computedPhantom, reconOk, problems };
}

// ---------------------------------------------------------------------------
// optimistic-locked debit of one numeric column (compare-and-swap on old value)
// ---------------------------------------------------------------------------
async function debitColumn(table, userId, column, oldVal, amount) {
  const newVal = parseFloat(f8(oldVal - amount));
  const { data, error } = await db.from(table)
    .update({ [column]: newVal, updated_at: nowIso() })
    .eq('user_id', userId)
    .eq(column, oldVal)
    .select('user_id');
  if (error) return { ok: false, reason: 'error:' + error.message, newVal };
  if (!data || data.length === 0) return { ok: false, reason: 'lock-miss (value changed under us)', newVal };
  return { ok: true, newVal };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(async () => {
  const mode = APPLY ? 'APPLY' : 'DRYRUN';
  const started = nowIso();
  console.log('='.repeat(100));
  console.log(`Aug-27 double-credit REVERSAL — mode=${mode} — ${started} — price $${PRICE}/BTC`);
  console.log(`batch-size=${BATCH_SIZE}  on-shortfall=${ON_SHORTFALL}${ONLY.length ? '  only=' + ONLY.join(',') : ''}`);
  if (!APPLY) console.log('DRY RUN — no writes. Fill dupRowIds in PLAN from the SUGGESTED lists below, then re-run, then --apply.');
  console.log('='.repeat(100));

  let plan = PLAN.slice();
  if (ONLY.length) plan = plan.filter(p => ONLY.map(x => x.toLowerCase()).includes(p.username.toLowerCase()));

  const runLog = { started, mode, batchSize: BATCH_SIZE, onShortfall: ON_SHORTFALL, users: [] };
  const batches = [];
  for (let i = 0; i < plan.length; i += BATCH_SIZE) batches.push(plan.slice(i, i + BATCH_SIZE));

  let abort = false;
  for (let b = 0; b < batches.length && !abort; b++) {
    const batch = batches[b];
    console.log(`\n${'#'.repeat(100)}\n# BATCH ${b + 1}/${batches.length}: ${batch.map(p => p.username).join(', ')}\n${'#'.repeat(100)}`);

    for (const p of batch) {
      const entry = { username: p.username, userId: p.userId, expectedPhantomBtc: p.expectedPhantomBtc, approx: !!p.approx };
      console.log(`\n--- ${p.username} (${p.userId}) ---`);

      let snap;
      try { snap = await loadUser(p); }
      catch (e) { entry.result = 'LOAD_ERROR: ' + e.message; console.log('  ' + entry.result); runLog.users.push(entry); continue; }

      if (!snap.dbUser) { entry.result = 'USER_NOT_FOUND'; console.log('  USER NOT FOUND'); runLog.users.push(entry); continue; }

      console.log(`  wallets.balance_btc      = ${f8(snap.wallets_balance_btc)} (${usd(snap.wallets_balance_btc)})`);
      console.log(`  user_balances.balance_btc= ${snap.user_balances_balance_btc == null ? '(no row)' : f8(snap.user_balances_balance_btc)}`);
      console.log(`  user_wallets.balance_btc = ${snap.user_wallets_balance_btc == null ? '(no row)' : f8(snap.user_wallets_balance_btc)}`);

      const suggestion = suggestDupRowIds(snap.rows);
      entry.suggestedDupRowIds = suggestion.map(s => s.id);
      console.log(`  SUGGESTED dup row ids (prior full-txid CONFIRMED credit exists): ${suggestion.length ? '' : '(none found — inspect recon output manually)'}`);
      suggestion.forEach(s => console.log(`     ${s.id}  amount=${f8(s.amount_btc)}  txid=${s.txid.slice(0, 20)}…  created=${s.created_at}`));
      const suggestedSum = parseFloat(f8(suggestion.reduce((s, r) => s + r.amount_btc, 0)));
      console.log(`     suggested sum = ${f8(suggestedSum)}  vs expected ${f8(p.expectedPhantomBtc)}  ${Math.abs(suggestedSum - p.expectedPhantomBtc) <= (p.approx ? APPROX_TOL : EXACT_TOL) ? 'MATCH' : 'DOES NOT MATCH — do not blind-trust'}`);

      if (!p.dupRowIds || p.dupRowIds.length === 0) {
        entry.result = 'NO_PINNED_IDS — filled nothing, skipped (this is expected on the first dry run)';
        console.log(`  => ${entry.result}`);
        runLog.users.push(entry);
        continue;
      }

      const val = validatePinnedRows(p, snap);
      entry.pinnedRowIds = p.dupRowIds;
      entry.computedPhantomBtc = val.computedPhantom;
      if (val.problems.length) {
        entry.result = 'VALIDATION_FAILED';
        entry.problems = val.problems;
        console.log('  VALIDATION FAILED — user skipped:');
        val.problems.forEach(x => console.log('     - ' + x));
        runLog.users.push(entry);
        continue;
      }

      console.log(`  pinned rows: ${val.targets.map(r => r.id).join(', ')}`);
      console.log(`  computed phantom (sum of pinned amount_btc) = ${f8(val.computedPhantom)} (${usd(val.computedPhantom)})  [reconciles with expected]`);

      if (!APPLY) {
        const wouldNeg = val.computedPhantom > snap.wallets_balance_btc + EXACT_TOL;
        console.log(`  would debit ${f8(val.computedPhantom)} from wallets.balance_btc -> ${f8(snap.wallets_balance_btc - val.computedPhantom)}` +
          (wouldNeg ? `  *** SHORTFALL: exceeds live balance by ${f8(val.computedPhantom - snap.wallets_balance_btc)} — user would be ${ON_SHORTFALL === 'clamp' ? 'CLAMPED' : 'SKIPPED'} under --apply ***` : ''));
        console.log(`  would mark REVERSED: ${val.targets.map(r => r.id).join(', ')}`);
        console.log(`  would insert balance_audit stamp (change_btc=${f8(-Math.min(val.computedPhantom, snap.wallets_balance_btc))}, reason=REVERSAL)`);
        entry.result = wouldNeg ? `DRY_OK_BUT_SHORTFALL(${ON_SHORTFALL})` : 'DRY_OK';
        runLog.users.push(entry);
        continue;
      }

      // ---- APPLY ----
      let res;
      try {
        res = await applyUserReversal(p, snap, val);
      } catch (e) {
        res = { status: 'ERROR', msg: 'exception: ' + (e.stack || e.message) };
      }
      entry.result = res.status;
      entry.detail = res;
      if (res.status === 'APPLIED') {
        console.log(`  APPLIED: reversed [${res.rows.join(', ')}], debited ${f8(res.debitAmt)} BTC, ${f8(res.preBtc)} -> ${f8(res.postBtc)}`);
        if (res.residual) console.log(`  RESIDUAL not debited (clamped): ${f8(res.residual)} BTC — needs manual follow-up`);
        (res.mirrorSkipped || []).forEach(m => console.log(`  mirror note: ${m}`));
      } else if (res.status === 'SKIP') {
        console.log(`  SKIPPED: ${res.msg}`);
      } else {
        console.log(`  ERROR: ${res.msg}`);
        console.log('  Aborting the whole run so nothing else is touched. Re-run after investigating.');
        abort = true;
      }
      runLog.users.push(entry);
      if (abort) break;
    }

    // ---- batch verification ----
    console.log(`\n  --- batch ${b + 1} verification (fresh read) ---`);
    for (const p of batch) {
      const { data: wal } = await db.from('wallets').select('balance_btc').eq('user_id', p.userId).maybeSingle();
      const logged = runLog.users.find(u => u.userId === p.userId);
      const pre = logged && logged.detail && logged.detail.preBtc != null ? logged.detail.preBtc : null;
      console.log(`    ${p.username}: wallets.balance_btc now = ${wal ? f8(wal.balance_btc) : '(no row)'}` +
        (pre != null ? `  (was ${f8(pre)} before this run)` : ''));
    }
  }

  const finished = nowIso();
  runLog.finished = finished;
  runLog.aborted = abort;

  // ---- summary ----
  console.log(`\n${'='.repeat(100)}\nSUMMARY (${mode})  ${started} -> ${finished}${abort ? '  [ABORTED]' : ''}\n${'='.repeat(100)}`);
  runLog.users.forEach(u => {
    console.log(`  ${String(u.username).padEnd(16)} ${String(u.result).padEnd(28)} ` +
      `expected=${f8(u.expectedPhantomBtc)}` +
      (u.computedPhantomBtc != null ? `  computed=${f8(u.computedPhantomBtc)}` : '') +
      (u.detail && u.detail.postBtc != null ? `  bal ${f8(u.detail.preBtc)}->${f8(u.detail.postBtc)}` : ''));
  });
  const applied = runLog.users.filter(u => u.result === 'APPLIED');
  const totalDebited = applied.reduce((s, u) => s + (u.detail?.debitAmt || 0), 0);
  console.log(`\n  users APPLIED: ${applied.length}/${runLog.users.length}   total BTC debited: ${f8(totalDebited)} (${usd(totalDebited)})`);

  const outName = `2026-08-27-reversal-doublecredit-${mode.toLowerCase()}-${finished.replace(/[:.]/g, '-')}.json`;
  const outPath = path.join(__dirname, outName);
  fs.writeFileSync(outPath, JSON.stringify(runLog, null, 2));
  console.log(`\n  run log written: scripts/${outName}`);
  console.log(APPLY ? '\n=== APPLY run complete. ===' : '\n=== DRY RUN complete — no writes. Fill PLAN.dupRowIds, re-run dry, then --apply. ===');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e); process.exit(1); });

// ---------------------------------------------------------------------------
// apply the reversal for one already-loaded user. Per-user best-effort rollback
// on any mid-sequence failure, then the caller aborts the whole run.
// ---------------------------------------------------------------------------
async function applyUserReversal(p, snap, val) {
  const done = { rowsReversed: [], balColsDebited: [] };
  const phantom = val.computedPhantom;
  const liveBtc = snap.wallets_balance_btc;
  if (liveBtc == null) return { status: 'ERROR', msg: 'no wallets row' };

  let debitAmt = phantom;
  let residual = 0;
  if (phantom > liveBtc + EXACT_TOL) {
    if (ON_SHORTFALL === 'clamp') { debitAmt = parseFloat(f8(liveBtc)); residual = parseFloat(f8(phantom - liveBtc)); }
    else return { status: 'SKIP', msg: `phantom ${f8(phantom)} > live balance ${f8(liveBtc)} — funds already moved. Use --on-shortfall=clamp or handle manually.` };
  }

  const rollback = async () => {
    for (const b of done.balColsDebited) {
      try { await db.from(b.table).update({ [b.column]: b.restore, updated_at: nowIso() }).eq('user_id', p.userId); } catch (_) {}
    }
    for (const r of done.rowsReversed) {
      try { await db.from('wallet_transactions').update({ status: r.prevStatus, notes: r.prevNotes }).eq('id', r.id); } catch (_) {}
    }
  };

  // 1) rows -> REVERSED
  for (const row of val.targets) {
    const note = (row.notes ? row.notes + ' ' : '') +
      `[REVERSED ${nowIso()} — 2026-08-27 deposit re-scan double-credit: re-credited an on-chain arrival already ` +
      `credited before Aug-27; phantom ${f8(parseFloat(row.amount_btc || 0))} BTC debited as part of a ${f8(phantom)} BTC ` +
      `reversal for this user. Prior legitimate credit retained. script=claude-reverse-aug27-doublecredit.js]`;
    const { data, error } = await db.from('wallet_transactions')
      .update({ status: 'REVERSED', notes: note })
      .eq('id', row.id).in('status', CREDITED_STATES).select('id');
    if (error || !data || data.length === 0) { await rollback(); return { status: 'ERROR', msg: `row ${row.id} update failed: ${error?.message || 'status changed under us'} — rolled back` }; }
    done.rowsReversed.push({ id: row.id, prevStatus: (row.status || '').toUpperCase(), prevNotes: row.notes || null });
  }

  // 2) wallets.balance_btc
  {
    const r = await debitColumn('wallets', p.userId, 'balance_btc', liveBtc, debitAmt);
    if (!r.ok) { await rollback(); return { status: 'ERROR', msg: `wallets debit ${r.reason} — rolled back` }; }
    done.balColsDebited.push({ table: 'wallets', column: 'balance_btc', restore: liveBtc });
  }

  // 3) mirrors
  const mirrorSkipped = [];
  for (const m of [
    { table: 'user_balances', column: 'balance_btc', val: snap.user_balances_balance_btc },
    { table: 'user_wallets',  column: 'balance_btc', val: snap.user_wallets_balance_btc },
  ]) {
    if (m.val == null) continue;
    if (m.val + EXACT_TOL < debitAmt) { mirrorSkipped.push(`${m.table}.${m.column}=${f8(m.val)} < debit ${f8(debitAmt)} — left as-is, manual review`); continue; }
    const r = await debitColumn(m.table, p.userId, m.column, m.val, debitAmt);
    if (!r.ok) { await rollback(); return { status: 'ERROR', msg: `${m.table}.${m.column} debit ${r.reason} — rolled back` }; }
    done.balColsDebited.push({ table: m.table, column: m.column, restore: m.val });
  }

  // 4) balance_audit stamp
  const postBtc = parseFloat(f8(liveBtc - debitAmt));
  const { error: auditErr } = await db.from('balance_audit').insert({
    user_id: p.userId, change_btc: parseFloat(f8(-debitAmt)), new_balance: postBtc, reason: 'REVERSAL', created_at: nowIso(),
  });
  if (auditErr) { await rollback(); return { status: 'ERROR', msg: `balance_audit insert failed: ${auditErr.message} — rolled back` }; }

  return { status: 'APPLIED', phantom, debitAmt, residual, preBtc: liveBtc, postBtc, rows: done.rowsReversed.map(r => r.id), mirrorSkipped };
}
