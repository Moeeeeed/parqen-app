'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const uid = '5c0eb1cc-715c-4366-afdb-34ae88205821';
(async () => {
  const { data, error } = await db.from('swap_transactions').select('*').eq('user_id', uid).order('created_at',{ascending:true});
  if (error) console.log('ERR', error.message);
  console.log(JSON.stringify(data, null, 2));
})();
