// Two fresh, genuine under-credits found by the live full-platform scan --
// same checkpoint-drift bug, still happening because the live server process
// hasn't been restarted to pick up today's fix. Credits the shortfall and
// sweeps using the current (fixed) code, same verified pattern as before.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const tronHotWallet = require('../services/tronHotWallet');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const TARGETS = [
  { name: 'raufadams07', userId: '579618af-d8cc-4152-9999-efef89eaa8a0', address: 'TG7i7oneCM5nX3EuARAbhTtJRPnU8MXFx6' },
  { name: 'otter_n1', userId: '868e1038-2102-44a1-b0d8-2d1aae2724b8', address: 'TAo5hEZMifocTNLspNsnTKNvKwZEwUDH6n' },
];

(async () => {
  for (const t of TARGETS) {
    console.log(`\n=== ${t.name} ===`);
    const { data: uw } = await db.from('user_wallets').select('last_onchain_usdt').eq('user_id', t.userId).maybeSingle();
    const checkpoint = parseFloat(uw?.last_onchain_usdt || 0);
    const onchain = await tronWallet.getUSDTBalance(t.address);
    const owed = parseFloat((onchain - checkpoint).toFixed(6));
    console.log(`checkpoint=${checkpoint} onchain=${onchain} owed=${owed}`);
    if (owed <= 0) { console.log('Nothing owed, skipping.'); continue; }

    const { data: wal } = await db.from('wallets').select('balance_usdt').eq('user_id', t.userId).maybeSingle();
    const current = parseFloat(wal.balance_usdt || 0);
    const newBal = parseFloat((current + owed).toFixed(6));
    const { error: updErr } = await db.from('wallets')
      .update({ balance_usdt: newBal, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId).eq('balance_usdt', current);
    if (updErr) { console.error('BALANCE UPDATE FAILED:', updErr.message); continue; }

    await db.from('wallet_transactions').insert({
      user_id: t.userId, type: 'ADJUSTMENT', currency: 'USDT', amount_btc: 0, amount_usdt: owed, status: 'CONFIRMED',
      notes: `Manual correction: fresh deposit under-credited because the live server hasn't yet picked up today's checkpoint-decrement fix. On-chain ${onchain} vs stale checkpoint ${checkpoint}. Adds the missing ${owed} USDT. Platform-wide audit follow-up, 2026-08-22.`,
      created_at: new Date().toISOString(),
    });
    console.log(`Credited +${owed} USDT. Balance ${current} -> ${newBal}`);

    await db.from('user_wallets').update({ last_onchain_usdt: onchain, updated_at: new Date().toISOString() }).eq('user_id', t.userId);

    console.log(`Sweeping ${onchain} USDT (awaiting completion)...`);
    const result = await tronHotWallet.sweepFromUserAddress(t.userId, t.address, onchain);
    console.log('Sweep result:', result);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
