// READ-ONLY diagnostic: confirms whether database/2026-08-25_balance_integrity_fix.sql
// was ever applied to the live DB, by checking if praqen_credit_deposit exists.
// Deliberately bogus user_id — if the function EXISTS, this raises a clean
// WALLET_NOT_FOUND domain error and the whole call rolls back (zero side effects,
// Postgres functions are one transaction). If the function does NOT exist,
// Supabase returns a distinct "could not find function in schema cache" error
// instead. Either way, nothing is written.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const { data, error } = await supa.rpc('praqen_credit_deposit', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_currency: 'USDT',
    p_amount: 0.000001,
    p_onchain_balance: 0,
    p_idempotency_key: 'diagnostic-check-' + Date.now(),
    p_note: 'read-only migration-status diagnostic, expected to fail safely',
  });
  console.log('data:', data);
  console.log('error:', error);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
