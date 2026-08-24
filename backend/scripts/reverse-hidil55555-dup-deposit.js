// Mirrors the Aug 23 remediation for this same user/bug: two DEPOSIT rows logged
// for the same on-chain BTC arrival (0.20020222 BTC, ~186ms apart — the realtime
// WebSocket service delivered the same confirmed tx via two different message
// shapes, see services/realtimeDepositService.js). Verified via full transaction
// reconciliation that wallets.balance_btc only reflects ONE of the two credits —
// this only flags the duplicate LOG row, no balance is touched.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const dupRowId = '037a879c-1c13-48e9-ab1d-dae818aeb059'; // the later of the two 05:05:43 DEPOSIT rows

  const { data: row, error: fetchErr } = await db.from('wallet_transactions')
    .select('*').eq('id', dupRowId).single();
  if (fetchErr || !row) { console.error('Row not found:', fetchErr?.message); return; }
  if (row.type !== 'DEPOSIT' || row.amount_btc !== 0.20020222 || row.status !== 'CONFIRMED') {
    console.error('Row does not match expected duplicate — aborting:', row);
    return;
  }

  const { data: updated, error } = await db.from('wallet_transactions')
    .update({
      status: 'REVERSED',
      notes: 'On-chain deposit — [REVERSED: duplicate log entry, same on-chain deposit detected twice by realtime WebSocket monitor race; balance verified correct via full transaction reconciliation, no credit adjustment made]',
    })
    .eq('id', dupRowId)
    .select().single();

  if (error) { console.error('Update failed:', error.message); return; }
  console.log('Reversed duplicate deposit row:', JSON.stringify(updated, null, 2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
