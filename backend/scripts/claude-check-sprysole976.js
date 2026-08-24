// READ-ONLY check: SprySole976 reports sending USDT to their wallet, but shows
// 0 USDT balance, no Tron address, and no USDT transactions. No writes anywhere.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USERNAME = 'SprySole976';

(async () => {
  const { data: user, error: uErr } = await supa
    .from('users')
    .select('id, username, email, created_at, account_status, kyc_status')
    .ilike('username', USERNAME)
    .maybeSingle();

  if (uErr || !user) {
    console.log('User lookup failed:', uErr?.message || 'not found');
    return;
  }
  console.log('user_id:', user.id, '| email:', user.email, '| created_at:', user.created_at, '| status:', user.account_status, '| kyc:', user.kyc_status);

  const { data: uw, error: uwErr } = await supa
    .from('user_wallets')
    .select('user_id, btc_address, tron_address, last_onchain_usdt, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  console.log('\n-- user_wallets --');
  console.log('row exists:', !!uw, uwErr?.message || '');
  console.log('tron_address:', uw?.tron_address || '(none)');
  console.log('last_onchain_usdt:', uw?.last_onchain_usdt, '| updated_at:', uw?.updated_at);

  const { data: wal, error: walErr } = await supa
    .from('wallets')
    .select('address, balance_usdt, locked_balance_usdt, balance_btc, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  console.log('\n-- wallets --');
  console.log('row exists:', !!wal, walErr?.message || '');
  console.log('balance_usdt:', wal?.balance_usdt, '| locked_balance_usdt:', wal?.locked_balance_usdt, '| updated_at:', wal?.updated_at);

  const { data: txs, error: txErr } = await supa
    .from('wallet_transactions')
    .select('type, currency, amount_usdt, amount_btc, status, notes, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('\n-- wallet_transactions (all currencies, last 20) --');
  console.log('error:', txErr?.message || 'none', '| count:', (txs || []).length);
  (txs || []).forEach(t => console.log('  -', t.created_at, t.type, t.currency, t.amount_usdt ?? t.amount_btc, t.status, t.notes || ''));

  // Was ensureWalletExists ever run for this user? If tron_address is null, no
  // Tron deposit address was ever provisioned — meaning any USDT they "sent to
  // their wallet" had nowhere on our books to land.
  if (!uw?.tron_address) {
    console.log('\n>>> ROOT CAUSE CANDIDATE: no tron_address on file. This account was never');
    console.log('    provisioned a USDT/Tron deposit address (ensureWalletExists never ran,');
    console.log('    or ran before the Tron/USDT flow existed). If the user was actually given');
    console.log('    a deposit address to send to (e.g. shown in the app UI at time of sending),');
    console.log('    it did NOT come from our backend record — need to ask them what address they sent to.');
  } else {
    console.log('\n-- checking that tron_address on-chain now --');
    try {
      const onchain = await tronWallet.getUSDTBalance(uw.tron_address);
      console.log('  ON-CHAIN USDT balance at', uw.tron_address, ':', onchain);
      const last = parseFloat(uw.last_onchain_usdt || 0);
      if (onchain > last + 0.01) {
        console.log('  >>> FLAG: on-chain balance exceeds last recorded — deposit not yet credited!');
      } else {
        console.log('  No on-chain funds sitting at this address beyond what is recorded.');
      }
    } catch (e) {
      console.log('  Error checking on-chain balance:', e.message);
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
