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
  const deposits = await fetchAll('wallet_transactions', 'id,user_id,amount_btc,status,created_at,notes',
    [['eq','eq','DEPOSIT']].map(() => ['type','eq','DEPOSIT'])[0] ? [['type','eq','DEPOSIT']] : []);
  console.log(`Total DEPOSIT rows fetched: ${deposits.length}`);

  // group by user_id + amount_btc (rounded) to find duplicates
  const groups = new Map();
  for (const d of deposits) {
    if (d.status !== 'CONFIRMED') continue; // only unreversed duplicates matter
    const key = `${d.user_id}|${fmt(d.amount_btc)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }

  let dupCount = 0;
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    // check if timestamps are close together (within 60s) - true double-credit signature
    rows.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < rows.length; i++) {
      const gapMs = new Date(rows[i].created_at) - new Date(rows[i-1].created_at);
      if (gapMs < 60000) {
        dupCount++;
        console.log(`DUP: user=${rows[0].user_id} amount=${fmt(rows[i].amount_btc)} gap=${gapMs}ms t1=${rows[i-1].created_at} t2=${rows[i].created_at} id1=${rows[i-1].id} id2=${rows[i].id}`);
      }
    }
  }
  console.log(`\nTotal likely-duplicate CONFIRMED DEPOSIT pairs found: ${dupCount}`);
})();
