'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
function fmt(n){ return parseFloat(n||0).toFixed(8); }

(async () => {
  const { data: users, error } = await db.from('users').select('id,username,email,account_status,created_at').ilike('username','cryptoeagle%');
  if (error) { console.error('ERR', error.message); process.exit(1); }
  console.log('users:', JSON.stringify(users, null, 2));
  if (!users || users.length === 0) return;
  const uid = users[0].id;

  const { data: w } = await db.from('wallets').select('*').eq('user_id', uid).maybeSingle();
  console.log('wallets:', JSON.stringify(w, null, 2));

  const { data: txs } = await db.from('wallet_transactions').select('*').eq('user_id', uid).order('created_at',{ascending:true});
  console.log(`\nwallet_transactions (${(txs||[]).length}):`);
  for (const t of txs||[]) {
    console.log(`${t.created_at}  ${t.type.padEnd(14)} status=${(t.status||'').padEnd(10)} btc=${fmt(t.amount_btc)} usdt=${t.amount_usdt} cur=${t.currency} tx_hash=${t.tx_hash||''} notes="${t.notes||''}"`);
  }
})();
