// scripts/backfill-deposit-idempotency-keys.js
// ─────────────────────────────────────────────────────────────────────────────
// PART 2 / step 2.1a.
//
// Fills wallet_transactions.idempotency_key = '<CURRENCY>:<user_id>:<tx_hash>'
// on historic DEPOSIT rows that ALREADY carry a real tx_hash but no key. After
// this runs, the deterministic-key guard added to the monitors (step 2.1c) and
// the unique index on idempotency_key both cover these rows, so the deposit they
// represent can never be credited a second time.
//
// It NEVER touches a balance, a mirror, a checkpoint, or an audit row. The only
// column it writes is idempotency_key, and only where it is currently NULL.
//
// Rows with NO usable tx_hash are the job of step 2.1b
// (backfill-deposit-tracking-v2.js), which resolves the txid on-chain first.
//
//   node scripts/backfill-deposit-idempotency-keys.js            # DRY RUN (default) — writes nothing
//   node scripts/backfill-deposit-idempotency-keys.js --commit   # actually writes
//
// Idempotent — safe to re-run. A second run finds nothing left to do.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const COMMIT = process.argv.includes('--commit');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The first outbound request in a fresh Node process on this host intermittently
// fails with "fetch failed" (cold DNS). Retry transient failures a few times.
async function withRetry(fn, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fn();
      if (res && res.error && /fetch failed|ETIMEDOUT|ENOTFOUND|ECONNRESET/i.test(res.error.message || '')) { last = res.error; }
      else return res;
    } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`gave up after ${tries} tries: ${last && last.message}`);
}

// Flush + exit on a short delay so undici sockets close cleanly (avoids a
// cosmetic libuv assertion on Windows/Node 24 when calling process.exit() hard).
function finish(code) { setTimeout(() => process.exit(code), 60); }

// A real Tron txid or BTC txid is 64 hex chars. Accept >= 32 to be lenient with
// any legacy shorthand, but require it to be plausibly a hash, not a placeholder.
const looksLikeTxid = h => typeof h === 'string' && /^[0-9a-fA-F]{32,64}$/.test(h.trim());

(async () => {
  console.log('='.repeat(78));
  console.log(`backfill-deposit-idempotency-keys  —  ${COMMIT ? '*** COMMIT (writing) ***' : 'DRY RUN (no writes)'}`);
  console.log(`${new Date().toISOString()}`);
  console.log('='.repeat(78));

  // page through all DEPOSIT rows
  let from = 0; const PAGE = 1000; const rows = [];
  while (true) {
    const { data, error } = await withRetry(() => s.from('wallet_transactions')
      .select('id, user_id, currency, amount_btc, amount_usdt, tx_hash, idempotency_key, notes, created_at')
      .eq('type', 'DEPOSIT').range(from, from + PAGE - 1));
    if (error) { console.error('fetch error:', error.message); return finish(1); }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }

  const todo = [];
  let alreadyKeyed = 0, noUsableHash = 0;
  for (const r of rows) {
    if (r.idempotency_key) { alreadyKeyed++; continue; }
    const h = (r.tx_hash || '').trim();
    if (!looksLikeTxid(h)) { noUsableHash++; continue; }
    if (!r.user_id || !['BTC', 'USDT'].includes(r.currency)) { noUsableHash++; continue; }
    todo.push({ id: r.id, key: `${r.currency}:${r.user_id}:${h}`, r });
  }

  console.log(`\nDEPOSIT rows scanned            : ${rows.length}`);
  console.log(`  already have an idem key      : ${alreadyKeyed}`);
  console.log(`  no usable tx_hash (-> 2.1b)   : ${noUsableHash}`);
  console.log(`  will get a key from this run  : ${todo.length}\n`);

  for (const t of todo) {
    console.log(`  row ${t.id}  ${t.r.created_at}  ${t.r.currency} ` +
      `${t.r.currency === 'BTC' ? Number(t.r.amount_btc).toFixed(8) : Number(t.r.amount_usdt).toFixed(6)}` +
      `  ->  ${t.key}`);
    console.log(`      notes: ${(t.r.notes || '').slice(0, 80)}`);
  }

  if (!COMMIT) {
    console.log(`\nDRY RUN — nothing written. Re-run with --commit to apply the ${todo.length} update(s) above.`);
    return finish(0);
  }

  let ok = 0, skip = 0, fail = 0;
  for (const t of todo) {
    // Guard against a race / prior partial run: only set it if still NULL, and
    // only if the exact key is not already used by another row (unique index).
    const { data: clash } = await s.from('wallet_transactions')
      .select('id').eq('idempotency_key', t.key).limit(1);
    if (clash && clash.length) { console.log(`  SKIP row ${t.id} — key ${t.key} already in use by row ${clash[0].id}`); skip++; continue; }

    const { error } = await s.from('wallet_transactions')
      .update({ idempotency_key: t.key })
      .eq('id', t.id).is('idempotency_key', null);
    if (error) { console.error(`  FAIL row ${t.id}: ${error.message}`); fail++; }
    else { console.log(`  OK   row ${t.id} -> ${t.key}`); ok++; }
  }
  console.log(`\nDONE — ${ok} updated, ${skip} skipped, ${fail} failed. No balance was touched.`);
  return finish(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e.stack || e.message); finish(1); });
