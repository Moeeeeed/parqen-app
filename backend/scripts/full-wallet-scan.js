// FULL platform-wide, read-only audit: for every user with a Tron address and/or
// a BTC address, compare what they've ever actually received on-chain (current
// address balance + everything already swept out of it) against what has been
// credited to their PRAQEN ledger. Flags any mismatch in either direction.
// NO WRITES. Designed to run long and unattended -- writes progress + a full
// result dump to disk as it goes so nothing is lost if it's interrupted.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const hdWallet = require('../services/hdWalletService');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const OUT_FILE = path.join(__dirname, 'full-wallet-scan-result.json');
const USDT_MISMATCH_THRESHOLD = 0.01;   // $0.01
const BTC_MISMATCH_THRESHOLD  = 0.0001; // ~ a few dollars; filters normal miner-fee noise from sweeps

async function withRetry(fn, label, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === attempts - 1) throw e;
      console.warn(`  retry ${i + 1} for ${label}: ${e.message}`);
      await sleep(2000);
    }
  }
}

async function auditUsdt(userId, username, tronAddress, sweptTotalCache) {
  const totalSwept = sweptTotalCache.get(userId) || 0;
  const onchain = await withRetry(() => tronWallet.getUSDTBalance(tronAddress), `USDT ${tronAddress}`);
  const totalEverReceived = parseFloat((onchain + totalSwept).toFixed(6));

  const { data: txs } = await db.from('wallet_transactions').select('amount_usdt')
    .eq('user_id', userId).eq('currency', 'USDT').eq('status', 'CONFIRMED').in('type', ['DEPOSIT', 'ADJUSTMENT']);
  const totalCredited = parseFloat(((txs || []).reduce((s, t) => s + parseFloat(t.amount_usdt || 0), 0)).toFixed(6));

  const shortfall = parseFloat((totalEverReceived - totalCredited).toFixed(6));
  return { userId, username, currency: 'USDT', address: tronAddress, onchain, totalSwept, totalEverReceived, totalCredited, shortfall };
}

async function auditBtc(userId, username, btcAddress, sweptTotalCache) {
  const totalSwept = sweptTotalCache.get(userId) || 0;
  const utxos = await withRetry(() => hdWallet.getUTXOs(btcAddress, { throwOnError: true }), `BTC ${btcAddress}`);
  const onchain = parseFloat(((utxos || []).reduce((s, u) => s + u.value, 0) / 1e8).toFixed(8));
  const totalEverReceived = parseFloat((onchain + totalSwept).toFixed(8));

  const { data: txs } = await db.from('wallet_transactions').select('amount_btc')
    .eq('user_id', userId).eq('type', 'DEPOSIT').eq('status', 'CONFIRMED');
  const totalCredited = parseFloat(((txs || []).reduce((s, t) => s + parseFloat(t.amount_btc || 0), 0)).toFixed(8));

  const shortfall = parseFloat((totalEverReceived - totalCredited).toFixed(8));
  return { userId, username, currency: 'BTC', address: btcAddress, onchain, totalSwept, totalEverReceived, totalCredited, shortfall };
}

async function fetchAllUserWallets() {
  // Unpaginated select() silently truncates at Supabase's default 1000-row cap —
  // the first run of this script missed the last ~300 accounts because of this.
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await db.from('user_wallets').select('user_id, tron_address, btc_address').range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

(async () => {
  console.log('Loading user wallets and usernames...');
  const uwRows = await fetchAllUserWallets();
  console.log(`Fetched ${uwRows.length} user_wallets rows (paginated).`);
  const { data: users } = await db.from('users').select('id, username');
  const nameMap = {};
  (users || []).forEach(u => nameMap[u.id] = u.username);

  const { data: usdtSweeps } = await db.from('hot_wallet_sweeps').select('user_id, amount_usdt').eq('status', 'COMPLETED');
  const usdtSweptTotals = new Map();
  (usdtSweeps || []).forEach(r => usdtSweptTotals.set(r.user_id, (usdtSweptTotals.get(r.user_id) || 0) + parseFloat(r.amount_usdt || 0)));

  const { data: btcSweeps } = await db.from('wallet_transactions').select('user_id, amount_btc').eq('type', 'SWEEP');
  const btcSweptTotals = new Map();
  (btcSweeps || []).forEach(r => btcSweptTotals.set(r.user_id, (btcSweptTotals.get(r.user_id) || 0) + parseFloat(r.amount_btc || 0)));

  const usdtTargets = (uwRows || []).filter(r => r.tron_address);
  const btcTargets  = (uwRows || []).filter(r => r.btc_address);

  console.log(`Scanning ${usdtTargets.length} USDT address(es) and ${btcTargets.length} BTC address(es)...\n`);

  const results = [];
  const flush = () => fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

  let i = 0;
  for (const r of usdtTargets) {
    i++;
    try {
      const res = await auditUsdt(r.user_id, nameMap[r.user_id] || r.user_id.slice(0, 8), r.tron_address, usdtSweptTotals);
      results.push(res);
      if (Math.abs(res.shortfall) > USDT_MISMATCH_THRESHOLD) {
        console.log(`🚨 [USDT ${i}/${usdtTargets.length}] ${res.username} | onchain=${res.onchain} swept=${res.totalSwept} received=${res.totalEverReceived} credited=${res.totalCredited} shortfall=${res.shortfall}`);
      } else if (i % 100 === 0) {
        console.log(`... USDT progress ${i}/${usdtTargets.length}`);
      }
    } catch (e) {
      results.push({ userId: r.user_id, username: nameMap[r.user_id], currency: 'USDT', address: r.tron_address, error: e.message });
      console.warn(`  [USDT ${i}/${usdtTargets.length}] ERROR for ${r.tron_address}: ${e.message}`);
    }
    if (i % 25 === 0) flush();
    await sleep(600);
  }
  flush();
  console.log(`\nUSDT scan complete. Starting BTC scan...\n`);

  let j = 0;
  for (const r of btcTargets) {
    j++;
    try {
      const res = await auditBtc(r.user_id, nameMap[r.user_id] || r.user_id.slice(0, 8), r.btc_address, btcSweptTotals);
      results.push(res);
      if (Math.abs(res.shortfall) > BTC_MISMATCH_THRESHOLD) {
        console.log(`🚨 [BTC ${j}/${btcTargets.length}] ${res.username} | onchain=${res.onchain} swept=${res.totalSwept} received=${res.totalEverReceived} credited=${res.totalCredited} shortfall=${res.shortfall}`);
      } else if (j % 50 === 0) {
        console.log(`... BTC progress ${j}/${btcTargets.length}`);
      }
    } catch (e) {
      results.push({ userId: r.user_id, username: nameMap[r.user_id], currency: 'BTC', address: r.btc_address, error: e.message });
      console.warn(`  [BTC ${j}/${btcTargets.length}] ERROR for ${r.btc_address}: ${e.message}`);
    }
    if (j % 20 === 0) flush();
    await sleep(2600);
  }
  flush();

  const flagged = results.filter(r => !r.error && Math.abs(r.shortfall) > (r.currency === 'BTC' ? BTC_MISMATCH_THRESHOLD : USDT_MISMATCH_THRESHOLD));
  const errored = results.filter(r => r.error);

  console.log('\n=== FINAL SUMMARY ===');
  console.log(`Total addresses checked: ${results.length}`);
  console.log(`Flagged mismatches: ${flagged.length}`);
  console.log(`Errored (could not check): ${errored.length}`);
  console.log('\nFlagged accounts:');
  flagged.forEach(r => console.log(`  ${r.shortfall > 0 ? '⬆️  UNDER-credited' : '⬇️  OVER-credited '} | ${r.currency} | ${r.username} (${r.userId}) | shortfall=${r.shortfall} | onchain=${r.onchain} swept=${r.totalSwept} credited=${r.totalCredited}`));

  const totalUsdtOwed = flagged.filter(r => r.currency === 'USDT' && r.shortfall > 0).reduce((s, r) => s + r.shortfall, 0);
  const totalUsdtOver = flagged.filter(r => r.currency === 'USDT' && r.shortfall < 0).reduce((s, r) => s + r.shortfall, 0);
  const totalBtcOwed  = flagged.filter(r => r.currency === 'BTC' && r.shortfall > 0).reduce((s, r) => s + r.shortfall, 0);
  const totalBtcOver  = flagged.filter(r => r.currency === 'BTC' && r.shortfall < 0).reduce((s, r) => s + r.shortfall, 0);
  console.log(`\nTotal USDT owed to users: ${totalUsdtOwed.toFixed(6)}`);
  console.log(`Total USDT over-credited: ${totalUsdtOver.toFixed(6)}`);
  console.log(`Total BTC owed to users: ${totalBtcOwed.toFixed(8)}`);
  console.log(`Total BTC over-credited: ${totalBtcOver.toFixed(8)}`);

  flush();
  console.log(`\nFull results written to ${OUT_FILE}`);
  console.log('SCAN_DONE');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
