// ONE-OFF CORRECTION — retroactive balance_audit stamps for king888 and
// kingkong79-pro, whose balances were credited (by someone/something outside
// this session — confirmed via claude-verify-claimed-credits.js) without a
// matching wallet_transactions row or balance_audit stamp. Checkpoint columns
// were already correctly advanced for both, so this only closes the ledger/
// audit-trail gap, specifically to stop the swap-safety check from firing a
// false "balance mismatch" on these two accounts.
//
// SAFETY DESIGN:
//   - "Idempotency" here means: only stamp if the LATEST recognized balance_audit
//     row doesn't already match the LIVE current balance. If it already matches
//     (e.g. this script already ran, or something else already fixed it), skip
//     that user — no duplicate stamp.
//   - Reads the CURRENT balance fresh, right before inserting, and stamps with
//     the CURRENT timestamp (not backdated) — guarantees this row is the
//     newest by construction, so the swap check picks it up regardless of
//     whatever else exists in the table.
//   - Does NOT touch wallets, user_wallets, or wallet_transactions — this is
//     purely a balance_audit stamp, nothing else.
//   - Each user is handled independently; one failing doesn't block the other.
//
// USAGE:
//   node scripts/correct-audit-trail-gap-king888-kingkong79.js            (dry run — default)
//   node scripts/correct-audit-trail-gap-king888-kingkong79.js --apply    (real write)

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const APPLY = process.argv.includes('--apply');

const TARGETS = [
  {
    label: 'king888',
    userId: '3c4f8383-85b4-4099-9bae-c67ed9345cd9',
    currency: 'BTC', // change_btc must be non-zero for the BTC-context check (_assertLedgerTrueBtc: .neq('change_btc', 0))
    knownDelta: 0.02480385, // the proven credited amount — used for change_btc, NOT the live total
  },
  {
    label: 'kingkong79-pro',
    userId: 'e8d3d037-554b-4b09-b8f7-373f03de10de',
    currency: 'USDT', // change_btc must be 0 for the USDT-context check (_assertLedgerTrueUsdt: .eq('change_btc', 0))
    knownDelta: 0, // USDT-context rows always use change_btc=0 by convention, regardless of the USDT amount
  },
];

const USDT_CONTEXT_REASONS = ['ESCROW_RELEASE', 'ESCROW_REFUND', 'SWAP_USDT', 'DEPOSIT', 'TRANSFER_OUT', 'TRANSFER_IN', 'WITHDRAWAL'];

async function main() {
  console.log(`Mode: ${APPLY ? '*** APPLY (will write) ***' : 'DRY RUN (no writes)'}\n`);

  for (const t of TARGETS) {
    console.log(`--- ${t.label} (${t.userId}) ---`);

    const { data: wal, error: walErr } = await supa.from('wallets').select('balance_btc, balance_usdt').eq('user_id', t.userId).maybeSingle();
    if (walErr || !wal) { console.log('  Could not read wallets row:', walErr?.message || 'not found'); continue; }
    const liveBalance = t.currency === 'BTC' ? parseFloat(wal.balance_btc) : parseFloat(wal.balance_usdt);
    console.log(`  Live current wallets.balance_${t.currency.toLowerCase()} = ${liveBalance}`);

    // Find the latest audit row in the relevant context (BTC: change_btc != 0; USDT: change_btc = 0 AND reason in whitelist)
    let query = supa.from('balance_audit').select('new_balance, reason, created_at').eq('user_id', t.userId).order('created_at', { ascending: false }).limit(1);
    query = t.currency === 'BTC' ? query.neq('change_btc', 0) : query.eq('change_btc', 0).in('reason', USDT_CONTEXT_REASONS);
    const { data: lastAudit } = await query.maybeSingle();
    console.log('  Latest relevant balance_audit row:', lastAudit || '(none)');

    const alreadyMatches = lastAudit && Math.abs(parseFloat(lastAudit.new_balance) - liveBalance) < (t.currency === 'BTC' ? 0.0000001 : 0.00001);
    if (alreadyMatches) {
      console.log(`  SKIP: latest audit stamp already matches live balance (${lastAudit.new_balance}) — nothing to do.\n`);
      continue;
    }

    const nowIso = new Date().toISOString();
    const row = {
      user_id: t.userId,
      change_btc: t.knownDelta, // the proven delta for this credit event, not the live total
      new_balance: liveBalance, // live-read, so this stamp matches whatever the balance actually is right now
      reason: 'DEPOSIT',
      created_at: nowIso,
    };
    console.log('  Planned INSERT into balance_audit:', row);

    if (!APPLY) {
      console.log('  (dry run — not inserted)\n');
      continue;
    }

    const { error: insErr } = await supa.from('balance_audit').insert(row);
    if (insErr) {
      console.error(`  🚨 FAILED to insert stamp for ${t.label}:`, insErr.message);
    } else {
      console.log(`  ✅ Stamp inserted for ${t.label}.`);
    }
    console.log();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
