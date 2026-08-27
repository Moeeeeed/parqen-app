// READ-ONLY final confirmation: check whether either of the two known
// uncredited tx hashes has been logged as a DEPOSIT since the last DB read,
// and re-read the current wallets/checkpoint state. SELECT-only.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USER_ID = '3c4f8383-85b4-4099-9bae-c67ed9345cd9';
const TX_HASHES = [
  'cc26732490c72447953859c640821a4b042851473121b9ee466265f888c49eec', // deposit #2 (swept)
  'eea66cf8d0ebb7fc911400a40e1cf5e9cb5199eca8c903cbd1472ffc2dce7801',  // deposit #3 (unswept, larger)
];

(async () => {
  const { data: wal } = await supa.from('wallets').select('balance_btc, locked_balance_btc, updated_at').eq('user_id', USER_ID).maybeSingle();
  console.log('Current wallets row:', wal);

  const { data: uw } = await supa.from('user_wallets').select('last_onchain_btc, updated_at').eq('user_id', USER_ID).maybeSingle();
  console.log('Current user_wallets checkpoint:', uw);

  for (const hash of TX_HASHES) {
    const { data: rows } = await supa.from('wallet_transactions').select('*').or(`tx_hash.eq.${hash},tx_hash.eq.${hash}_DEPOSIT,notes.ilike.%${hash}%`);
    console.log(`\nRecords referencing ${hash}: ${(rows || []).length}`);
    (rows || []).forEach(r => console.log('  ', JSON.stringify(r)));
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
