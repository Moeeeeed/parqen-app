'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';

(async () => {
  const { data: user } = await db.from('users').select('id,username,email').eq('id', COMPANY_WALLET_ID).maybeSingle();
  console.log('company user row:', JSON.stringify(user));

  const { data: byName } = await db.from('users').select('id,username,email').ilike('username', 'praqen%');
  console.log('users matching praqen%:', JSON.stringify(byName, null, 2));

  const { data: w } = await db.from('wallets').select('*').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
  console.log('company wallets row:', JSON.stringify(w, null, 2));

  const { data: ub } = await db.from('user_balances').select('*').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
  console.log('company user_balances row:', JSON.stringify(ub, null, 2));
})();
