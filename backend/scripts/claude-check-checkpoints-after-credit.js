// READ-ONLY: check whether the checkpoint columns were updated alongside the
// unlogged balance changes on king888 and kingkong79-pro, to assess double-
// credit risk. SELECT-only.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const IDS = {
  king888: '3c4f8383-85b4-4099-9bae-c67ed9345cd9',
  'kingkong79-pro': 'e8d3d037-554b-4b09-b8f7-373f03de10de',
};

(async () => {
  for (const [label, id] of Object.entries(IDS)) {
    const { data: uw } = await supa.from('user_wallets').select('last_onchain_btc, last_onchain_usdt, updated_at').eq('user_id', id).maybeSingle();
    console.log(`${label}: user_wallets checkpoint =`, uw);
    const { data: audit } = await supa.from('balance_audit').select('reason, change_btc, new_balance, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(3);
    console.log(`${label}: most recent balance_audit rows:`, audit);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
