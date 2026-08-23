// READ-ONLY scan: compare every wallet's on-chain BTC/USDT balance against the
// last_onchain_btc / last_onchain_usdt figure stored in user_wallets, to find
// deposits the (currently-disabled) monitors never credited. Reuses the exact
// same balance-fetch logic as the real monitors — no writes anywhere.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// mempool.space is unreachable from this host (times out every request) —
// go straight to blockstream.info, which responds fine, instead of eating a
// 14s timeout per address before the real check even happens.
async function fetchBtcAddress(address) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await axios.get(`https://blockstream.info/api/address/${address}`, { timeout: 8000 });
      return resp.data;
    } catch (e) {
      const status = e.response?.status;
      if (status === 429 && attempt < 3) {
        await sleep(3000 * (attempt + 1)); // 3s, 6s, 9s backoff
        continue;
      }
      throw e;
    }
  }
}

// Supabase caps an unpaginated select() at 1000 rows — page through in
// batches of 1000 so every wallet actually gets scanned, not just the first 1000.
async function fetchAllRows(table, columns, filterFn) {
  let all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = supa.from(table).select(columns).range(from, from + PAGE - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) { console.error(`${table} fetch error:`, error.message); break; }
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function scanUsdt() {
  const wallets = await fetchAllRows('user_wallets', 'user_id, tron_address, last_onchain_usdt',
    q => q.not('tron_address', 'is', null).neq('tron_address', ''));
  console.log(`\n=== Scanning ${wallets.length} USDT (Tron) addresses ===`);
  const flagged = [];
  let i = 0;
  for (const w of wallets) {
    i++;
    try {
      const onchain = await tronWallet.getUSDTBalance(w.tron_address);
      const last = parseFloat(w.last_onchain_usdt || 0);
      if (onchain > last + 0.01) {
        flagged.push({ user_id: w.user_id, address: w.tron_address, onchain, last_recorded: last, undetected: parseFloat((onchain - last).toFixed(6)) });
        console.log(`  [${i}/${wallets.length}] FLAG user=${w.user_id.slice(0,8)} onchain=$${onchain} last=$${last} undetected=$${(onchain-last).toFixed(6)}`);
      } else if (i % 100 === 0) {
        console.log(`  [${i}/${wallets.length}] ...scanning (no issues so far)`);
      }
    } catch (e) {
      console.warn(`  [${i}/${wallets.length}] error for ${w.user_id.slice(0,8)}: ${e.message}`);
    }
    await sleep(550);
  }
  return flagged;
}

async function scanBtc() {
  const wallets = await fetchAllRows('user_wallets', 'user_id, btc_address, last_onchain_btc',
    q => q.not('btc_address', 'is', null).neq('btc_address', ''));
  console.log(`\n=== Scanning ${wallets.length} BTC addresses ===`);
  const flagged = [];
  let i = 0;
  for (const w of wallets) {
    i++;
    try {
      const addrData = await fetchBtcAddress(w.btc_address);
      const chainStats = addrData?.chain_stats || {};
      const sats = (chainStats.funded_txo_sum || 0) - (chainStats.spent_txo_sum || 0);
      const onchain = parseFloat((sats / 1e8).toFixed(8));
      const last = parseFloat(w.last_onchain_btc || 0);
      if (onchain > last + 0.000000009) {
        flagged.push({ user_id: w.user_id, address: w.btc_address, onchain, last_recorded: last, undetected: parseFloat((onchain - last).toFixed(8)) });
        console.log(`  [${i}/${wallets.length}] FLAG user=${w.user_id.slice(0,8)} onchain=₿${onchain} last=₿${last} undetected=₿${(onchain-last).toFixed(8)}`);
      } else if (i % 100 === 0) {
        console.log(`  [${i}/${wallets.length}] ...scanning (no issues so far)`);
      }
    } catch (e) {
      console.warn(`  [${i}/${wallets.length}] error for ${w.user_id.slice(0,8)}: ${e.message}`);
    }
    await sleep(800);
  }
  return flagged;
}

(async () => {
  // USDT pass already completed cleanly in a prior run (1350/1350 addresses,
  // 0 flags) — only re-running BTC here, which hit blockstream.info rate
  // limits partway through last time and left ~49% of addresses unchecked.
  const btcFlags = await scanBtc();
  console.log('\n\n========== SCAN COMPLETE (BTC only) ==========');
  console.log('BTC undetected deposits found:', btcFlags.length);
  console.log(JSON.stringify(btcFlags, null, 2));
})();
