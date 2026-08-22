// One-off correction for accounts found under-credited by the last_onchain_usdt
// checkpoint-drift bug (fixed in tronHotWallet.js). For each target: credit the
// owed shortfall with a documented ADJUSTMENT, then sweep the real on-chain
// balance to the hot wallet and WAIT for it to actually finish (the production
// fire-and-forget sweep call was previously killed early by an exiting script).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('./../services/tronWalletService');
const tronHotWallet = require('./../services/tronHotWallet');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const TARGETS = [
  { name: 'ukbuyer2022', userId: '19563f83-e4dd-468e-8bfe-47220cc23bb0', address: 'TQdRryWdhfZheXZbe9jNvp6xnyt1z4gq4c', shortfall: 298.5 },
  { name: 'raufadams07', userId: '579618af-d8cc-4152-9999-efef89eaa8a0', address: 'TG7i7oneCM5nX3EuARAbhTtJRPnU8MXFx6', shortfall: 41 },
];

(async () => {
  for (const t of TARGETS) {
    console.log(`\n=== ${t.name} ===`);

    const onchain = await tronWallet.getUSDTBalance(t.address);
    console.log(`On-chain now: ${onchain} USDT`);

    const { data: wal } = await db.from('wallets').select('balance_usdt').eq('user_id', t.userId).maybeSingle();
    const current = parseFloat(wal.balance_usdt || 0);
    const newBal = parseFloat((current + t.shortfall).toFixed(6));

    const { error: updErr } = await db.from('wallets')
      .update({ balance_usdt: newBal, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId)
      .eq('balance_usdt', current);
    if (updErr) { console.error('BALANCE UPDATE FAILED:', updErr.message); continue; }
    console.log(`Credited +${t.shortfall} USDT. Balance ${current} -> ${newBal}`);

    await db.from('wallet_transactions').insert({
      user_id: t.userId,
      type: 'ADJUSTMENT',
      currency: 'USDT',
      amount_btc: 0,
      amount_usdt: t.shortfall,
      status: 'CONFIRMED',
      notes: `Manual correction: usdtDepositMonitor under-credited a deposit to ${t.address} because last_onchain_usdt was never reset down after an earlier sweep, so the comparison never re-triggered once on-chain balance (${onchain}) dropped back below the stale checkpoint. This adds the missing ${t.shortfall} USDT. Platform-wide audit, 2026-08-22.`,
      created_at: new Date().toISOString(),
    });

    // Mark this on-chain balance as accounted for, then sweep it — mirrors
    // the atomic claim + credit + sweep sequence in usdtDepositMonitor.js,
    // but done explicitly here so we can await the sweep to completion.
    await db.from('user_wallets')
      .update({ last_onchain_usdt: onchain, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId);

    console.log(`Sweeping ${onchain} USDT to hot wallet (awaiting completion)...`);
    const result = await tronHotWallet.sweepFromUserAddress(t.userId, t.address, onchain);
    console.log('Sweep result:', result);

    const afterOnchain = await tronWallet.getUSDTBalance(t.address);
    const { data: afterWal } = await db.from('wallets').select('balance_usdt').eq('user_id', t.userId).maybeSingle();
    console.log(`After sweep — on-chain: ${afterOnchain} | wallets.balance_usdt: ${afterWal.balance_usdt}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
