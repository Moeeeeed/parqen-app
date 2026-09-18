// READ-ONLY. Lists BTC + USDT sitting in user deposit addresses that has NOT been
// swept to the hot wallet yet. SELECTs + public explorer GETs only — no writes,
// no sweeps, no balance changes.
//
// Method: take every deposit address that has had deposit activity in the last
// LOOKBACK_DAYS (from deposit_tracking_v2), read its live on-chain balance, and
// report anything non-zero. For BTC it also says whether the sweep is currently
// GATED (an uncredited UTXO on the address — sweepService refuses to sweep the
// whole address until DepositMonitor credits every UTXO on it).
'use strict';
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const LOOKBACK_DAYS   = 60;
const SWEEP_MIN_SATS  = 10000;               // sweepService dust floor
const f8 = n => Number(n || 0).toFixed(8);
const f2 = n => Number(n || 0).toFixed(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pageAll(table, cols, filt) {
  let out = [], from = 0; const P = 1000;
  for (;;) {
    let q = db.from(table).select(cols).range(from, from + P - 1);
    if (filt) q = filt(q);
    const { data, error } = await q;
    if (error) { console.error(`${table}:`, error.message); break; }
    out = out.concat(data || []);
    if (!data || data.length < P) break;
    from += P;
  }
  return out;
}

async function btcAddr(a) {
  const { data } = await axios.get(`https://blockstream.info/api/address/${a}`, { timeout: 15000 });
  const cs = data?.chain_stats || {}, ms = data?.mempool_stats || {};
  return {
    confirmedSats: (cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0),
    mempoolSats:   (ms.funded_txo_sum || 0) - (ms.spent_txo_sum || 0),
  };
}
async function btcUtxos(a) {
  const { data } = await axios.get(`https://blockstream.info/api/address/${a}/utxo`, { timeout: 15000 });
  return data || [];
}

(async () => {
  console.log('READ-ONLY pending-sweep scan  ', new Date().toISOString());
  console.log(`Lookback: ${LOOKBACK_DAYS} days | BTC dust floor: ${SWEEP_MIN_SATS} sats (${f8(SWEEP_MIN_SATS / 1e8)} BTC)\n`);

  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString();

  // 1. Candidate addresses = anything with deposit activity in the window.
  const dt = await pageAll('deposit_tracking_v2', 'address, user_id, currency, tx_hash, amount, credited, created_at',
    q => q.gte('created_at', sinceIso));
  console.log(`deposit_tracking_v2 rows in window: ${dt.length}`);

  const btcAddrs  = [...new Set(dt.filter(r => (r.currency || 'BTC').toUpperCase() === 'BTC').map(r => r.address).filter(Boolean))];
  const usdtAddrs = [...new Set(dt.filter(r => (r.currency || '').toUpperCase() === 'USDT').map(r => r.address).filter(Boolean))];

  // usernames
  const uids = [...new Set(dt.map(r => r.user_id).filter(Boolean))];
  const uname = {};
  for (let i = 0; i < uids.length; i += 300) {
    const { data } = await db.from('users').select('id, username').in('id', uids.slice(i, i + 300));
    (data || []).forEach(u => { uname[u.id] = u.username; });
  }
  const addrUser = {};
  dt.forEach(r => { if (r.address && !addrUser[r.address]) addrUser[r.address] = uname[r.user_id] || r.user_id?.slice(0, 8) || '?'; });

  // credited-hash set per address (for the sweep-gate check)
  const creditedByAddr = {};
  dt.forEach(r => {
    if (!r.address) return;
    (creditedByAddr[r.address] = creditedByAddr[r.address] || { credited: new Set(), all: new Set() });
    creditedByAddr[r.address].all.add(r.tx_hash);
    if (r.credited) creditedByAddr[r.address].credited.add(r.tx_hash);
  });

  // 2. BTC scan
  console.log(`\n=== BTC — scanning ${btcAddrs.length} deposit address(es) with recent activity ===`);
  const btcHits = [];
  for (let i = 0; i < btcAddrs.length; i++) {
    const a = btcAddrs[i];
    try {
      const s = await btcAddr(a);
      const total = s.confirmedSats + Math.max(0, s.mempoolSats);
      if (total > 0) {
        let gated = false, uncredited = 0;
        try {
          const utxos = await btcUtxos(a);
          const cset = creditedByAddr[a]?.credited || new Set();
          uncredited = utxos.filter(u => !cset.has(u.txid)).length;
          gated = uncredited > 0 && (creditedByAddr[a]?.all.size || 0) > 0;
          await sleep(400);
        } catch {}
        btcHits.push({
          a, user: addrUser[a] || '?', confirmed: s.confirmedSats, mempool: s.mempoolSats,
          sweepable: s.confirmedSats >= SWEEP_MIN_SATS,
          dust: s.confirmedSats > 0 && s.confirmedSats < SWEEP_MIN_SATS,
          gated, uncredited,
        });
      }
    } catch (e) {
      console.log(`  ! ${a} — explorer error ${e.response?.status || ''} ${e.message}`);
    }
    await sleep(1600);
    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${btcAddrs.length}`);
  }

  // 3. USDT scan
  console.log(`\n=== USDT (Tron) — scanning ${usdtAddrs.length} deposit address(es) with recent activity ===`);
  const usdtHits = [];
  for (let i = 0; i < usdtAddrs.length; i++) {
    const a = usdtAddrs[i];
    try {
      const bal = await tronWallet.getUSDTBalance(a);
      if (Number(bal) > 0) usdtHits.push({ a, user: addrUser[a] || '?', usdt: Number(bal) });
    } catch (e) {
      console.log(`  ! ${a} — tron error ${e.message}`);
    }
    await sleep(500);
    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${usdtAddrs.length}`);
  }

  // 4. Report
  console.log('\n' + '='.repeat(78));
  console.log('BTC sitting in deposit addresses (not yet swept):');
  console.log('='.repeat(78));
  btcHits.sort((x, y) => y.confirmed - x.confirmed);
  let btcSweepable = 0, btcDust = 0, btcGated = 0;
  for (const h of btcHits) {
    const tag = h.gated ? 'GATED (uncredited UTXO)' : h.sweepable ? 'sweepable next cycle' : h.dust ? 'DUST — never auto-sweeps' : '';
    if (h.sweepable && !h.gated) btcSweepable += h.confirmed;
    if (h.gated) btcGated += h.confirmed;
    if (h.dust) btcDust += h.confirmed;
    console.log(`  ${String(h.user).padEnd(22)} ${h.a}  confirmed ${f8(h.confirmed / 1e8)}${h.mempool ? `  (+mempool ${f8(h.mempool / 1e8)})` : ''}  — ${tag}`);
  }
  if (!btcHits.length) console.log('  (none)');

  console.log('\n' + '='.repeat(78));
  console.log('USDT (TRC-20) sitting in deposit addresses (not yet swept):');
  console.log('='.repeat(78));
  usdtHits.sort((x, y) => y.usdt - x.usdt);
  let usdtTotal = 0;
  for (const h of usdtHits) { usdtTotal += h.usdt; console.log(`  ${String(h.user).padEnd(22)} ${h.a}  $${f2(h.usdt)}`); }
  if (!usdtHits.length) console.log('  (none)');

  console.log('\n' + '='.repeat(78));
  console.log('TOTALS');
  console.log('='.repeat(78));
  console.log(`  BTC sweepable next cycle : ${f8(btcSweepable / 1e8)} BTC  (${btcHits.filter(h => h.sweepable && !h.gated).length} addr)`);
  console.log(`  BTC gated (uncredited)   : ${f8(btcGated / 1e8)} BTC  (${btcHits.filter(h => h.gated).length} addr) — sweep waits on DepositMonitor`);
  console.log(`  BTC dust (< floor)       : ${f8(btcDust / 1e8)} BTC  (${btcHits.filter(h => h.dust).length} addr) — will NOT auto-sweep`);
  console.log(`  USDT pending sweep       : $${f2(usdtTotal)}  (${usdtHits.length} addr)`);
  console.log('\nREAD-ONLY. Nothing changed.');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e); process.exit(1); });
