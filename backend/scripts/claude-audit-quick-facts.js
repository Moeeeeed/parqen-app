// READ-ONLY: quick DB-only facts to accompany the deposit-sync audit — no
// blockchain calls, no writes. (1) RPC existence checks for
// praqen_credit_deposit and praqen_refund_escrow, via the same side-effect-free
// method used earlier (a bogus user_id either raises a clean internal error,
// which rolls back the whole call, or fails to find the function — nothing is
// ever written either way). (2) Population size of provisioned deposit
// addresses. (3) DEPOSIT-type wallet_transactions counts before/after
// 2026-08-25 per currency, to see whether deposit-crediting visibly stopped.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const CUTOFF = '2026-08-25T00:00:00Z';

(async () => {
  console.log('=== 1. RPC existence checks (side-effect-free) ===');
  for (const fn of ['praqen_credit_deposit', 'praqen_refund_escrow']) {
    const params = fn === 'praqen_credit_deposit'
      ? { p_user_id: '00000000-0000-0000-0000-000000000000', p_currency: 'USDT', p_amount: 0.000001, p_onchain_balance: 0, p_idempotency_key: 'audit-check-' + Date.now(), p_note: 'read-only existence check' }
      : { p_trade_id: '00000000-0000-0000-0000-000000000000', p_provider_id: '00000000-0000-0000-0000-000000000000', p_amount_btc: 0.000001, p_reason: 'read-only existence check' };
    const { error } = await supa.rpc(fn, params);
    if (!error) { console.log(`  ${fn}: unexpected success (should have raised on bogus IDs) — investigate`); continue; }
    if (error.code === 'PGRST202') console.log(`  ${fn}: DOES NOT EXIST (PGRST202) — ${error.message}`);
    else console.log(`  ${fn}: EXISTS — call reached the function body and raised its own internal error: [${error.code}] ${error.message}`);
  }

  console.log('\n=== 2. Provisioned deposit address population ===');
  const { count: usdtAddrCount } = await supa.from('user_wallets').select('user_id', { count: 'exact', head: true }).not('tron_address', 'is', null).neq('tron_address', '');
  const { count: btcAddrCount } = await supa.from('user_wallets').select('user_id', { count: 'exact', head: true }).not('btc_address', 'is', null).neq('btc_address', '');
  console.log(`  user_wallets rows with a tron_address: ${usdtAddrCount}`);
  console.log(`  user_wallets rows with a btc_address:  ${btcAddrCount}`);

  console.log(`\n=== 3. DEPOSIT-type wallet_transactions, before vs after ${CUTOFF} ===`);
  for (const currency of ['USDT', 'BTC']) {
    const { count: before } = await supa.from('wallet_transactions').select('id', { count: 'exact', head: true })
      .eq('type', 'DEPOSIT').eq('currency', currency).lt('created_at', CUTOFF);
    const { count: after } = await supa.from('wallet_transactions').select('id', { count: 'exact', head: true })
      .eq('type', 'DEPOSIT').eq('currency', currency).gte('created_at', CUTOFF);
    console.log(`  ${currency}: before=${before}  after=${after}`);
  }

  console.log('\n=== 4. kingkong79-pro re-confirmation (already found this session) ===');
  const { data: user } = await supa.from('users').select('id, username').ilike('username', 'kingkong79-pro').maybeSingle();
  if (user) {
    const { data: uw } = await supa.from('user_wallets').select('tron_address, last_onchain_usdt, updated_at').eq('user_id', user.id).maybeSingle();
    const { data: wal } = await supa.from('wallets').select('balance_usdt').eq('user_id', user.id).maybeSingle();
    const { data: dep } = await supa.from('wallet_transactions').select('id, created_at, amount_usdt').eq('user_id', user.id).eq('type', 'DEPOSIT').eq('currency', 'USDT');
    console.log(`  user_id=${user.id}  tron_address=${uw?.tron_address}  last_onchain_usdt=${uw?.last_onchain_usdt}  checkpoint_updated_at=${uw?.updated_at}`);
    console.log(`  wallets.balance_usdt=${wal?.balance_usdt}`);
    console.log(`  wallet_transactions DEPOSIT/USDT rows: ${(dep || []).length}`, dep);
  } else {
    console.log('  kingkong79-pro not found (unexpected)');
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
