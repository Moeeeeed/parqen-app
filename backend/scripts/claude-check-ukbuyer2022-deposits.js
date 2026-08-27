// READ-ONLY follow-up: get the COMPLETE deposit history (server-side filter,
// no row-count limit hiding older rows) for ukbuyer2022, both currencies.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USER_ID = '19563f83-e4dd-468e-8bfe-47220cc23bb0';

(async () => {
  const { data: deposits } = await supa.from('wallet_transactions')
    .select('*')
    .eq('user_id', USER_ID)
    .eq('type', 'DEPOSIT')
    .order('created_at', { ascending: true });
  console.log(`Total DEPOSIT-type rows (all time, both currencies): ${(deposits || []).length}`);
  (deposits || []).forEach(d => console.log('  ', JSON.stringify(d)));

  const { data: sweeps } = await supa.from('wallet_transactions')
    .select('type, currency, amount_btc, status, tx_hash, notes, created_at')
    .eq('user_id', USER_ID)
    .eq('type', 'SWEEP')
    .order('created_at', { ascending: true });
  console.log(`\nTotal SWEEP-type rows: ${(sweeps || []).length}`);
  (sweeps || []).forEach(s => console.log('  ', JSON.stringify(s)));

  // full BTC-only history, no limit, to see the real chronology
  const { data: allBtc } = await supa.from('wallet_transactions')
    .select('type, amount_btc, status, tx_hash, notes, created_at')
    .eq('user_id', USER_ID).eq('currency', 'BTC')
    .order('created_at', { ascending: true });
  console.log(`\nTotal BTC wallet_transactions (all time): ${(allBtc || []).length}`);
  console.log('Earliest 10:');
  (allBtc || []).slice(0, 10).forEach(t => console.log(`  - ${t.created_at} | ${t.type} | ${t.amount_btc} | ${t.status} | ${t.tx_hash || ''} | ${t.notes || ''}`));
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
