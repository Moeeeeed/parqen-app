// READ-ONLY BTC deposit scan, v2 — same purpose as claude-scan-undetected-deposits.js
// (compare on-chain BTC balance per address vs user_wallets.last_onchain_btc) but
// paced gently: one attempt per address, longer spacing, and a real cooldown on a
// 429 instead of 4 rapid retries — the v1 run got hard rate-limited by
// blockstream.info around address 700/1400 (its retry-storm made it worse, each
// 429'd address burning ~18s on doomed retries while barely making progress).
// No writes anywhere.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

async function fetchBtcAddress(address) {
  const resp = await axios.get(`https://blockstream.info/api/address/${address}`, { timeout: 10000 });
  return resp.data;
}

(async () => {
  const wallets = await fetchAllRows('user_wallets', 'user_id, btc_address, last_onchain_btc',
    q => q.not('btc_address', 'is', null).neq('btc_address', ''));
  console.log(`=== Scanning ${wallets.length} BTC addresses (v2, gentle pacing) ===`);

  const flagged = [];
  const unverified = [];
  let i = 0;
  let cooldownMs = 2200; // base spacing between requests

  for (const w of wallets) {
    i++;
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      try {
        const addrData = await fetchBtcAddress(w.btc_address);
        const cs = addrData?.chain_stats || {};
        const sats = (cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0);
        const onchain = parseFloat((sats / 1e8).toFixed(8));
        const last = parseFloat(w.last_onchain_btc || 0);
        if (onchain > last + 0.000000009) {
          flagged.push({ user_id: w.user_id, address: w.btc_address, onchain, last_recorded: last, undetected: parseFloat((onchain - last).toFixed(8)) });
          console.log(`  [${i}/${wallets.length}] FLAG user=${w.user_id.slice(0,8)} onchain=BTC${onchain} last=BTC${last} undetected=BTC${(onchain-last).toFixed(8)}`);
        } else if (i % 100 === 0) {
          console.log(`  [${i}/${wallets.length}] ...scanning (no issues so far)`);
        }
        done = true;
      } catch (e) {
        const status = e.response?.status;
        if (status === 429) {
          console.warn(`  [${i}/${wallets.length}] 429 on ${w.user_id.slice(0,8)} — cooling down 20s`);
          await sleep(20000);
          cooldownMs = Math.min(cooldownMs + 500, 5000); // ratchet spacing up, capped
        } else if (attempt === 0) {
          await sleep(2000);
        } else {
          console.warn(`  [${i}/${wallets.length}] giving up on ${w.user_id.slice(0,8)}: ${e.message}`);
          unverified.push({ user_id: w.user_id, address: w.btc_address, reason: e.message });
          done = true;
        }
      }
    }
    await sleep(cooldownMs);
  }

  console.log('\n\n========== BTC SCAN v2 COMPLETE ==========');
  console.log('BTC undetected deposits found:', flagged.length);
  console.log(JSON.stringify(flagged, null, 2));
  console.log('\nAddresses never successfully verified:', unverified.length);
  console.log(JSON.stringify(unverified, null, 2));
})();
