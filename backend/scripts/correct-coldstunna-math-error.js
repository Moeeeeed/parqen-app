// Corrects a math error in the earlier ColdStunna fix (correct-coldstunna-deposit.js):
// that script treated the Aug 22 on-chain balance (88.5) as if it still included the
// already-swept Aug 17 deposit (12.302484) and subtracted it as a "checkpoint delta" --
// but the Aug 17 amount had already left the address via sweep, so the 88.5 read was
// the ENTIRE new deposit, not 88.5-including-the-old-amount. That under-credited him
// by exactly 12.302484 (subtracted the Aug 17 amount twice: once implicitly, since it
// was already in his balance, and once explicitly in the delta calculation).
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const userId = '2af3a00b-d3a7-41f3-b9a5-f7dc601bdd39';
  const correction = 12.302484;

  const { data: wal } = await db.from('wallets').select('balance_usdt').eq('user_id', userId).maybeSingle();
  const current = parseFloat(wal.balance_usdt || 0);
  const newBal = parseFloat((current + correction).toFixed(6));

  const { error: updErr } = await db.from('wallets')
    .update({ balance_usdt: newBal, updated_at: new Date().toISOString() })
    .eq('user_id', userId).eq('balance_usdt', current);
  if (updErr) { console.error('UPDATE FAILED:', updErr.message); return; }

  await db.from('wallet_transactions').insert({
    user_id: userId, type: 'ADJUSTMENT', currency: 'USDT', amount_btc: 0, amount_usdt: correction, status: 'CONFIRMED',
    notes: `Correction of a math error in an earlier fix (wallet_transactions id from ~15:07 today): the Aug 22 on-chain deposit read (88.5) was treated as including the already-swept Aug 17 deposit and had 12.302484 subtracted from it as a stale checkpoint delta, but the Aug 17 amount had already left the address via sweep -- the 88.5 reading was the entire new deposit. This adds back the ${correction} USDT that was mistakenly deducted twice.`,
    created_at: new Date().toISOString(),
  });

  console.log(`Corrected. Balance ${current} -> ${newBal}`);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
