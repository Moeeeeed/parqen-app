'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

function fmt(n){ return parseFloat(n||0).toFixed(8); }

async function fetchAll(table, select, filters) {
  let all = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = db.from(table).select(select).range(from, from + PAGE - 1);
    for (const [col, op, val] of filters) q = q[op](col, val);
    const { data, error } = await q;
    if (error) { console.error(`fetchAll ${table} error:`, error.message); break; }
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

(async () => {
  const feeTrades = await fetchAll('trades', 'platform_fee_btc, platform_fee_usdt, fee_status, currency, id, completed_at',
    [['status','eq','COMPLETED']]);
  console.log(`Total COMPLETED trades fetched: ${feeTrades.length}`);

  let btcT=0, usdtT=0, collectedCount=0, zeroFeeButCollected=0;
  for (const t of feeTrades) {
    if (t.fee_status !== 'COLLECTED') continue;
    collectedCount++;
    const fb = parseFloat(t.platform_fee_btc||0);
    const fu = parseFloat(t.platform_fee_usdt||0);
    btcT += fb; usdtT += fu;
    if (fb === 0 && fu === 0) zeroFeeButCollected++;
  }
  console.log(`fee_status=COLLECTED trades: ${collectedCount}`);
  console.log(`  Sum platform_fee_btc:  ${fmt(btcT)}`);
  console.log(`  Sum platform_fee_usdt: ${usdtT.toFixed(6)}`);
  console.log(`  COLLECTED trades with platform_fee_btc=0 AND platform_fee_usdt=0: ${zeroFeeButCollected}`);
})();
