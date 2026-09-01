// READ-ONLY. Dump deposit_tracking_v2 + coverage gaps.
'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: rows, error } = await db.from('deposit_tracking_v2').select('*');
  if (error) { console.log('err:', error.message); }
  console.log('deposit_tracking_v2 columns:', rows && rows[0] ? Object.keys(rows[0]).join(', ') : '(no rows)');
  (rows || []).forEach(r => console.log(JSON.stringify(r)));

  console.log('\n-- yornnguyen (695d7e05) in deposit_tracking_v2 --');
  const y = (rows || []).filter(r => r.user_id === '695d7e05-999f-4264-9952-5ae6730de32a');
  console.log(y.length ? y.map(r => JSON.stringify(r)).join('\n') : '(none)');

  const { data: w } = await db.from('wallets').select('user_id');
  const { data: ub } = await db.from('user_balances').select('user_id');
  const s = new Set((ub || []).map(x => x.user_id));
  console.log(`\nusers with wallets row but NO user_balances row: ${(w || []).filter(x => !s.has(x.user_id)).length} of ${(w || []).length}`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
