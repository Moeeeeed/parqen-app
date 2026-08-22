// otter_n1: a second deposit of 22 USDT only got partially detected (17 of 22)
// due to the live server's still-unpatched checkpoint bug, leaving 5 USDT
// sitting on-chain, uncredited and unswept, with the checkpoint left at 22
// (overstating what was actually credited+swept, so simple delta math against
// it doesn't work here). Credits the missing 5 directly, sweeps it, then sets
// the checkpoint to 0 to match true post-sweep on-chain reality.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const tronHotWallet = require('../services/tronHotWallet');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const userId = '868e1038-2102-44a1-b0d8-2d1aae2724b8';
  const address = 'TAo5hEZMifocTNLspNsnTKNvKwZEwUDH6n';

  const onchain = await tronWallet.getUSDTBalance(address);
  console.log('On-chain now:', onchain);
  if (onchain <= 0) { console.log('Nothing on-chain, aborting.'); return; }

  const { data: wal } = await db.from('wallets').select('balance_usdt').eq('user_id', userId).maybeSingle();
  const current = parseFloat(wal.balance_usdt || 0);
  const newBal = parseFloat((current + onchain).toFixed(6));
  const { error: updErr } = await db.from('wallets')
    .update({ balance_usdt: newBal, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('balance_usdt', current);
  if (updErr) { console.error('UPDATE FAILED:', updErr.message); return; }

  await db.from('wallet_transactions').insert({
    user_id: userId, type: 'ADJUSTMENT', currency: 'USDT', amount_btc: 0, amount_usdt: onchain, status: 'CONFIRMED',
    notes: `Manual correction: a 22 USDT deposit was only partially detected (17 of 22) due to the live server's still-unpatched checkpoint bug, leaving ${onchain} USDT on-chain uncredited. Adds the missing amount.`,
    created_at: new Date().toISOString(),
  });
  console.log(`Credited +${onchain} USDT. Balance ${current} -> ${newBal}`);

  console.log(`Sweeping ${onchain} USDT (awaiting completion)...`);
  const result = await tronHotWallet.sweepFromUserAddress(userId, address, onchain);
  console.log('Sweep result:', result);

  const afterOnchain = await tronWallet.getUSDTBalance(address);
  console.log('On-chain after sweep:', afterOnchain);
  await db.from('user_wallets').update({ last_onchain_usdt: afterOnchain, updated_at: new Date().toISOString() }).eq('user_id', userId);
  console.log('Checkpoint set to true post-sweep on-chain balance:', afterOnchain);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
