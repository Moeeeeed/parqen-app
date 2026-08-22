// Round 2 corrections: accounts found by the full platform scan with real
// on-chain funds sitting at their deposit address that were never credited.
// Re-reads fresh on-chain balances immediately before crediting (values may
// have moved since the scan ran). Credits only -- does not sweep; sweeping is
// a separate, explicitly-authorized action per prior conversation.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const hdWallet = require('../services/hdWalletService');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function creditUsdt(userId, name, tronAddress) {
  const onchain = await tronWallet.getUSDTBalance(tronAddress);
  const { data: uw } = await db.from('user_wallets').select('last_onchain_usdt').eq('user_id', userId).maybeSingle();
  const checkpoint = parseFloat(uw?.last_onchain_usdt || 0);
  const owed = parseFloat((onchain - checkpoint <= 0 ? onchain : onchain - checkpoint).toFixed(6));
  // If onchain <= checkpoint (stale-checkpoint case, same as ukbuyer2022/raufadams07), the
  // full onchain balance is the owed amount since none of it was ever credited off this drop.
  // If onchain > checkpoint, only the delta above the checkpoint is new/uncredited.
  console.log(`${name}: onchain=${onchain} checkpoint=${checkpoint} owed=${owed}`);
  if (owed <= 0) { console.log(`${name}: nothing owed, skipping`); return; }

  const { data: wal } = await db.from('wallets').select('balance_usdt').eq('user_id', userId).maybeSingle();
  const current = parseFloat(wal.balance_usdt || 0);
  const newBal = parseFloat((current + owed).toFixed(6));
  const { error: updErr } = await db.from('wallets')
    .update({ balance_usdt: newBal, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('balance_usdt', current);
  if (updErr) { console.error(name, 'UPDATE FAILED:', updErr.message); return; }

  await db.from('wallet_transactions').insert({
    user_id: userId, type: 'ADJUSTMENT', currency: 'USDT', amount_btc: 0, amount_usdt: owed, status: 'CONFIRMED',
    notes: `Manual correction: platform-wide audit found ${onchain} USDT on-chain at ${tronAddress} vs a stale last_onchain_usdt checkpoint of ${checkpoint}, meaning ${owed} was never credited. Platform-wide audit, 2026-08-22.`,
    created_at: new Date().toISOString(),
  });
  console.log(`${name}: credited +${owed} USDT. Balance ${current} -> ${newBal}`);
}

async function creditBtc(userId, name, btcAddress) {
  const utxos = await hdWallet.getUTXOs(btcAddress, { throwOnError: true });
  const onchain = parseFloat(((utxos || []).reduce((s, u) => s + u.value, 0) / 1e8).toFixed(8));
  console.log(`${name}: onchain=${onchain} BTC at ${btcAddress}`);
  if (onchain <= 0) { console.log(`${name}: nothing on-chain, skipping`); return; }

  const { data: wal } = await db.from('wallets').select('balance_btc').eq('user_id', userId).maybeSingle();
  const current = parseFloat(wal.balance_btc || 0);
  const newBal = parseFloat((current + onchain).toFixed(8));
  const { error: updErr } = await db.from('wallets')
    .update({ balance_btc: newBal, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('balance_btc', current);
  if (updErr) { console.error(name, 'UPDATE FAILED:', updErr.message); return; }

  await db.from('wallet_transactions').insert({
    user_id: userId, type: 'ADJUSTMENT', amount_btc: onchain, amount_usdt: 0, status: 'CONFIRMED',
    notes: `Manual correction: platform-wide audit found ${onchain} BTC on-chain at ${btcAddress} that was never credited (no DEPOSIT record). Platform-wide audit, 2026-08-22.`,
    created_at: new Date().toISOString(),
  });
  console.log(`${name}: credited +${onchain} BTC. Balance ${current} -> ${newBal}`);
}

(async () => {
  await creditUsdt('868e1038-2102-44a1-b0d8-2d1aae2724b8', '@otter_n1', 'TAo5hEZMifocTNLspNsnTKNvKwZEwUDH6n');
  await creditBtc('5dd1f3cd-9b88-4170-9df5-56eef8bb80de', 'djafarservices', 'bc1qfc8v2yc56cgd8kttz985hjx3f3hsfu4vuu9j5v');
  await creditBtc('085bed69-b5ec-4ea4-ae4b-06c4f85ace93', 'shaunfiedler5', 'bc1q07jkfzgumla0dre2qea5awcjtk9qmrfuc34qeh');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
