// Credit Starseeedx (formerly shaunfiedler5) for a BTC deposit that was never
// picked up by DepositMonitor at all -- zero wallet_transactions ever recorded
// for this account despite 0.00049886 BTC sitting at their deposit address.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWallet = require('../services/hdWalletService');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const userId = '085bed69-b5ec-4ea4-ae4b-06c4f85ace93';
  const address = 'bc1q07jkfzgumla0dre2qea5awcjtk9qmrfuc34qeh';

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
    notes: `Manual correction: BTC deposit to ${address} was never picked up by DepositMonitor -- zero prior wallet_transactions for this account. User reported "sent funds, can't see it." Adds the full ${onchain} BTC.`,
    created_at: new Date().toISOString(),
  });

  await db.from('user_wallets').update({ last_onchain_btc: onchain, updated_at: new Date().toISOString() }).eq('user_id', userId);

  const { data: afterWal } = await db.from('wallets').select('balance_btc').eq('user_id', userId).maybeSingle();
  console.log('Credited. Balance', current, '->', afterWal.balance_btc);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
