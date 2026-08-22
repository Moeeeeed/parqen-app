// 1realmessiah: 0.00331024 BTC sitting on-chain, never credited or swept --
// last_onchain_btc checkpoint was never claimed for this address at all.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWallet = require('../services/hdWalletService');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const userId = '164b46ad-f251-48d4-bb71-4461232e88e4';
  const address = 'bc1q7lv99sm3pnls2vhrrwva0wv65szsntse8xazcs';

  const utxos = await hdWallet.getUTXOs(address, { throwOnError: true });
  const onchain = parseFloat(((utxos || []).reduce((s, u) => s + u.value, 0) / 1e8).toFixed(8));
  console.log('On-chain BTC now:', onchain);
  if (onchain <= 0) { console.log('Nothing on-chain, aborting.'); return; }

  const { data: wal } = await db.from('wallets').select('balance_btc').eq('user_id', userId).maybeSingle();
  const current = parseFloat(wal.balance_btc || 0);
  const newBal = parseFloat((current + onchain).toFixed(8));

  const { error: updErr } = await db.from('wallets')
    .update({ balance_btc: newBal, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('balance_btc', current);
  if (updErr) { console.error('UPDATE FAILED:', updErr.message); return; }

  await db.from('wallet_transactions').insert({
    user_id: userId, type: 'ADJUSTMENT', amount_btc: onchain, amount_usdt: 0, status: 'CONFIRMED',
    notes: `Manual correction: BTC deposit to ${address} was never picked up by DepositMonitor -- last_onchain_btc checkpoint was never claimed for this address. Found by platform-wide audit. Adds the full ${onchain} BTC.`,
    created_at: new Date().toISOString(),
  });

  await db.from('user_wallets').update({ last_onchain_btc: onchain, updated_at: new Date().toISOString() }).eq('user_id', userId);
  console.log(`Credited +${onchain} BTC. Balance ${current} -> ${newBal}`);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
