'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const { data: trades } = await db.from('trades').select('fee_status').eq('status','COMPLETED');
  const counts = {};
  for (const t of trades||[]) {
    const k = t.fee_status === null ? 'NULL' : t.fee_status;
    counts[k] = (counts[k]||0)+1;
  }
  console.log('fee_status distribution across COMPLETED trades:', JSON.stringify(counts, null, 2));
})();
