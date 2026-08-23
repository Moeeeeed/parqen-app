// READ-ONLY scan: compare every user_wallets.tron_address's on-chain USDT
// balance against last_onchain_usdt, to find deposits no monitor ever credited.
// Companion to claude-scan-undetected-deposits.js (which currently only runs the
// BTC half) — this covers USDT since that address set may have grown/changed
// since the last USDT pass. No writes anywhere.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');

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

async function scanUsdt() {
  const wallets = await fetchAllRows('user_wallets', 'user_id, tron_address, last_onchain_usdt',
    q => q.not('tron_address', 'is', null).neq('tron_address', ''));
  console.log(`=== Scanning ${wallets.length} USDT (Tron) addresses ===`);
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

(async () => {
  const flags = await scanUsdt();
  console.log('\n\n========== USDT SCAN COMPLETE ==========');
  console.log('USDT undetected deposits found:', flags.length);
  console.log(JSON.stringify(flags, null, 2));
})();
