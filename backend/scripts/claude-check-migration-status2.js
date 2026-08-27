// READ-ONLY: confirm current existence + security config of all 3 RPCs, via
// the same side-effect-free method (bogus IDs -> internal error if the
// function exists, PGRST202 if not). No writes anywhere.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const checks = [
    ['praqen_credit_deposit', { p_user_id: '00000000-0000-0000-0000-000000000000', p_currency: 'USDT', p_amount: 0.000001, p_onchain_balance: 0, p_idempotency_key: 'x-' + Date.now(), p_note: 'check' }],
    ['praqen_internal_transfer', { p_sender_id: '00000000-0000-0000-0000-000000000000', p_recipient_id: '00000000-0000-0000-0000-000000000001', p_currency: 'USDT', p_amount: 0.000001, p_idempotency_key: 'x-' + Date.now(), p_note: 'check' }],
    ['praqen_reject_withdrawal', { p_tx_id: '00000000-0000-0000-0000-000000000000', p_ceo_id: '00000000-0000-0000-0000-000000000000', p_reason: 'existence check' }],
  ];
  for (const [fn, params] of checks) {
    const { error } = await supa.rpc(fn, params);
    if (!error) console.log(`${fn}: unexpected success`);
    else if (error.code === 'PGRST202') console.log(`${fn}: MISSING (PGRST202)`);
    else console.log(`${fn}: EXISTS — [${error.code}] ${error.message}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
