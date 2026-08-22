// One-off correction for accounts whose BTC was auto-swept to the hot wallet
// but never credited to their PRAQEN balance (SweepService's credited-check
// guard did not catch these). The BTC is already in company custody --
// this only adds the missing ledger credit, no on-chain movement needed.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const TARGETS = [
  { name: 'dajiba', userId: 'f2ccebad-2e73-440c-8641-8b99090f8ffb', shortfall: 0.002908, sweepTx: 'd00cd54b5966935463d63d271766a0d77b4f790e2f4c62cdebb323cad09472b8' },
  { name: 'FulBright-Success99', userId: 'cd748527-6ba1-4f4e-8c7f-053d85b0fc5b', shortfall: 0.00057922, sweepTx: 'dadd725cb5b12351fc52e0923669d690a7a781d73e5918e0db1de6387db0ad27' },
];

(async () => {
  for (const t of TARGETS) {
    const { data: wal } = await db.from('wallets').select('balance_btc').eq('user_id', t.userId).maybeSingle();
    const current = parseFloat(wal.balance_btc || 0);
    const newBal = parseFloat((current + t.shortfall).toFixed(8));

    const { error: updErr } = await db.from('wallets')
      .update({ balance_btc: newBal, updated_at: new Date().toISOString() })
      .eq('user_id', t.userId)
      .eq('balance_btc', current);
    if (updErr) { console.error(t.name, 'UPDATE FAILED:', updErr.message); continue; }

    const { error: txErr } = await db.from('wallet_transactions').insert({
      user_id: t.userId,
      type: 'ADJUSTMENT',
      amount_btc: t.shortfall,
      amount_usdt: 0,
      status: 'CONFIRMED',
      notes: `Manual correction: BTC was auto-swept to the hot wallet (tx ${t.sweepTx}) but never credited to this user's balance. This adds the missing ${t.shortfall} BTC. Platform-wide audit, 2026-08-22.`,
      created_at: new Date().toISOString(),
    });
    if (txErr) console.warn(t.name, 'wallet_transactions insert warning:', txErr.message);

    console.log(`${t.name}: credited +${t.shortfall} BTC. Balance ${current} -> ${newBal}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
