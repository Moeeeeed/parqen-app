// Credit ColdStunna's missed 88.5 USDT deposit (tx 986b8b8f8a59b2be94c96bf921a1890d798238d39a736cea3b4e3eafd0506973)
// then sweep it to the hot wallet, awaiting completion.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const tronHotWallet = require('../services/tronHotWallet');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const userId = '2af3a00b-d3a7-41f3-b9a5-f7dc601bdd39';
  const address = 'TYyVr23HPS9c5uiUtd7RcAsQ5hqAo2JmK7';
  const alreadyCredited = 12.302484; // stale checkpoint from the Aug 17 deposit, already credited then

  const onchain = await tronWallet.getUSDTBalance(address);
  console.log('On-chain now:', onchain);

  const { data: wal } = await db.from('wallets').select('balance_usdt').eq('user_id', userId).maybeSingle();
  const current = parseFloat(wal.balance_usdt || 0);
  const shortfall = parseFloat((onchain - alreadyCredited).toFixed(6));
  const newBal = parseFloat((current + shortfall).toFixed(6));
  console.log('current balance:', current, '| shortfall to add:', shortfall, '| new balance:', newBal);

  const { error: updErr } = await db.from('wallets')
    .update({ balance_usdt: newBal, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('balance_usdt', current);
  if (updErr) { console.error('UPDATE FAILED:', updErr.message); return; }

  await db.from('wallet_transactions').insert({
    user_id: userId, type: 'ADJUSTMENT', currency: 'USDT', amount_btc: 0, amount_usdt: shortfall, status: 'CONFIRMED',
    notes: `Manual correction: usdtDepositMonitor never picked up a new 88.5 USDT on-chain deposit (tx 986b8b8f8a59b2be94c96bf921a1890d798238d39a736cea3b4e3eafd0506973) because last_onchain_usdt was stuck at ${alreadyCredited} from a prior sweep. Adds the full missing amount.`,
    created_at: new Date().toISOString(),
  });

  await db.from('user_wallets').update({ last_onchain_usdt: onchain, updated_at: new Date().toISOString() }).eq('user_id', userId);

  console.log(`Sweeping ${onchain} USDT to hot wallet (awaiting completion)...`);
  const result = await tronHotWallet.sweepFromUserAddress(userId, address, onchain);
  console.log('Sweep result:', result);

  const afterOnchain = await tronWallet.getUSDTBalance(address);
  const { data: afterWal } = await db.from('wallets').select('balance_usdt').eq('user_id', userId).maybeSingle();
  console.log('AFTER — on-chain:', afterOnchain, '| wallets.balance_usdt:', afterWal.balance_usdt);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
