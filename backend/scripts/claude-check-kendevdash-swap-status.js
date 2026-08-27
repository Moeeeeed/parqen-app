// READ-ONLY re-check of KEN IGHO (kendevdash@gmail.com) — the account behind
// the "swap refused" screenshot from earlier this session. SELECT-only.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USER_ID = '65830906-297b-4eb5-8c60-ed0e9a4aac82';

(async () => {
  const { data: wal } = await supa.from('wallets').select('balance_usdt, balance_btc, updated_at').eq('user_id', USER_ID).maybeSingle();
  console.log('Current wallets:', wal);

  const { data: lastUsdtAudit } = await supa.from('balance_audit')
    .select('new_balance, reason, created_at')
    .eq('user_id', USER_ID).eq('change_btc', 0)
    .in('reason', ['ESCROW_RELEASE', 'ESCROW_REFUND', 'SWAP_USDT', 'DEPOSIT', 'TRANSFER_OUT', 'TRANSFER_IN', 'WITHDRAWAL'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  console.log('Last USDT-context balance_audit stamp (what the swap check compares against):', lastUsdtAudit);

  const mismatch = Math.abs(parseFloat(wal?.balance_usdt || 0) - parseFloat(lastUsdtAudit?.new_balance || 0));
  console.log(`Current mismatch: $${mismatch.toFixed(6)} (guard fires if > 0.00001)`);

  console.log('\nRecent wallet_transactions (last 10):');
  const { data: txs } = await supa.from('wallet_transactions')
    .select('type, currency, amount_usdt, status, notes, created_at')
    .eq('user_id', USER_ID).order('created_at', { ascending: false }).limit(10);
  (txs || []).forEach(t => console.log(`  - ${t.created_at} | ${t.type} | ${t.currency} | ${t.amount_usdt} | ${t.status} | ${t.notes || ''}`));

  console.log('\n=== praqen_credit_deposit RPC existence (side-effect-free check) ===');
  const { error } = await supa.rpc('praqen_credit_deposit', {
    p_user_id: '00000000-0000-0000-0000-000000000000', p_currency: 'USDT', p_amount: 0.000001,
    p_onchain_balance: 0, p_idempotency_key: 'recheck-' + Date.now(), p_note: 'existence check',
  });
  if (!error) console.log('  unexpected success');
  else if (error.code === 'PGRST202') console.log('  STILL MISSING (PGRST202):', error.message);
  else console.log('  EXISTS NOW — internal error (expected for bogus IDs):', error.code, error.message);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
