// Fills the gap left by full-wallet-scan.js, whose unpaginated user_wallets
// select() silently truncated at Supabase's default 1000-row cap. This
// properly paginates to fetch all rows, diffs against what was already
// scanned (full-wallet-scan-result.json), and only checks the addresses that
// were missed. Same read-only audit logic as the original script.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const hdWallet = require('../services/hdWalletService');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PREV_FILE = path.join(__dirname, 'full-wallet-scan-result.json');
const OUT_FILE  = path.join(__dirname, 'full-wallet-scan-remainder-result.json');
const USDT_MISMATCH_THRESHOLD = 0.01;
const BTC_MISMATCH_THRESHOLD  = 0.0001;

async function fetchAllUserWallets() {
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

(async () => {
  console.log('Fetching ALL user_wallets rows (paginated)...');
  const allRows = await fetchAllUserWallets();
  console.log(`Total rows fetched: ${allRows.length}`);

  const prev = JSON.parse(fs.readFileSync(PREV_FILE, 'utf8'));
  const scannedUsdt = new Set(prev.filter(r => r.currency === 'USDT').map(r => r.userId));
  const scannedBtc  = new Set(prev.filter(r => r.currency === 'BTC').map(r => r.userId));

  const { data: users } = await db.from('users').select('id, username');
  const nameMap = {};
  (users || []).forEach(u => nameMap[u.id] = u.username);

  const { data: usdtSweeps } = await db.from('hot_wallet_sweeps').select('user_id, amount_usdt').eq('status', 'COMPLETED');
  const usdtSweptTotals = new Map();
  (usdtSweeps || []).forEach(r => usdtSweptTotals.set(r.user_id, (usdtSweptTotals.get(r.user_id) || 0) + parseFloat(r.amount_usdt || 0)));

  const { data: btcSweeps } = await db.from('wallet_transactions').select('user_id, amount_btc').eq('type', 'SWEEP');
  const btcSweptTotals = new Map();
  (btcSweeps || []).forEach(r => btcSweptTotals.set(r.user_id, (btcSweptTotals.get(r.user_id) || 0) + parseFloat(r.amount_btc || 0)));

  const usdtTargets = allRows.filter(r => r.tron_address && !scannedUsdt.has(r.user_id));
  const btcTargets  = allRows.filter(r => r.btc_address && !scannedBtc.has(r.user_id));
  console.log(`Missed last time: ${usdtTargets.length} USDT address(es), ${btcTargets.length} BTC address(es)\n`);

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
      } else if (i % 50 === 0) {
        console.log(`... USDT progress ${i}/${usdtTargets.length}`);
      }
    } catch (e) {
      results.push({ userId: r.user_id, username: nameMap[r.user_id], currency: 'USDT', address: r.tron_address, error: e.message });
    }
    if (i % 25 === 0) flush();
    await sleep(600);
  }
  flush();
  console.log(`\nUSDT remainder scan complete. Starting BTC remainder scan...\n`);

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
    }
    if (j % 20 === 0) flush();
    await sleep(2600);
  }
  flush();

  const flagged = results.filter(r => !r.error && Math.abs(r.shortfall) > (r.currency === 'BTC' ? BTC_MISMATCH_THRESHOLD : USDT_MISMATCH_THRESHOLD));
  console.log('\n=== REMAINDER SUMMARY ===');
  console.log(`Checked: ${results.length} | Flagged: ${flagged.length}`);
  flagged.forEach(r => console.log(`  ${r.shortfall > 0 ? '⬆️  UNDER-credited' : '⬇️  OVER-credited '} | ${r.currency} | ${r.username} (${r.userId}) | shortfall=${r.shortfall} | onchain=${r.onchain} swept=${r.totalSwept} credited=${r.totalCredited}`));
  console.log('\nSCAN_DONE');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
