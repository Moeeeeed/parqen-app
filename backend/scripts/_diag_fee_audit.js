'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const uid = '14762cd0-d3b2-474f-acab-fe0071961e9a';

(async () => {
  const { data: audit, error } = await db.from('balance_audit').select('created_at,reason,change_btc,new_balance,trade_id').eq('user_id', uid).limit(500);
  if (error) { console.error('ERR', error.message); process.exit(1); }
  const sorted = (audit||[]).sort((a,b)=> new Date(a.created_at)-new Date(b.created_at));
  console.log(`=== praqen fee wallet balance_audit (${sorted.length} rows) ===`);
  for (const a of sorted) {
    console.log(`${a.created_at}  reason=${(a.reason||'').padEnd(30)} change_btc=${a.change_btc}  new_balance=${a.new_balance}  trade_id=${a.trade_id||''}`);
  }
})();
