// READ-ONLY investigation: identify the user behind the screenshotted swap-refusal
// ("USDT balance $398.003714 does not match last verified $0.003714 as of
// 2026-08-23T23:03:17.063") and trace what credited their balance since then,
// to find which wallet-credit path is missing a balance_audit stamp. No writes.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const { data: audit, error: aErr } = await supa
    .from('balance_audit')
    .select('user_id, new_balance, change_btc, reason, created_at')
    .eq('change_btc', 0)
    .gte('new_balance', 0.0036)
    .lte('new_balance', 0.0038)
    .gte('created_at', '2026-08-23T22:00:00')
    .lte('created_at', '2026-08-24T00:00:00')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('candidate balance_audit rows near that timestamp/value:', aErr?.message || '', audit);
  if (!audit || !audit.length) { console.log('No matching audit row found — try widening the search window.'); return; }

  for (const row of audit) {
    const userId = row.user_id;
    const { data: user } = await supa.from('users').select('id, username, email').eq('id', userId).maybeSingle();
    console.log(`\n=== user_id ${userId} (${user?.username || '?'} / ${user?.email || '?'}) ===`);

    const { data: wal } = await supa.from('wallets').select('balance_usdt, balance_btc, updated_at').eq('user_id', userId).maybeSingle();
    console.log('current wallet balance_usdt:', wal?.balance_usdt, '| balance_btc:', wal?.balance_btc, '| updated_at:', wal?.updated_at);

    const { data: txs } = await supa
      .from('wallet_transactions')
      .select('type, currency, amount_usdt, amount_btc, status, notes, created_at')
      .eq('user_id', userId)
      .gte('created_at', row.created_at)
      .order('created_at', { ascending: true })
      .limit(50);
    console.log(`wallet_transactions since ${row.created_at} (${(txs || []).length} rows):`);
    (txs || []).forEach(t => console.log('  -', t.created_at, t.type, t.currency, t.amount_usdt ?? t.amount_btc, t.status, t.notes || ''));

    const { data: laterAudit } = await supa
      .from('balance_audit')
      .select('new_balance, change_btc, reason, created_at')
      .eq('user_id', userId)
      .gt('created_at', row.created_at)
      .order('created_at', { ascending: true })
      .limit(20);
    console.log(`balance_audit rows since ${row.created_at} (${(laterAudit || []).length} rows):`);
    (laterAudit || []).forEach(a => console.log('  -', a.created_at, 'reason:', a.reason, 'change_btc:', a.change_btc, 'new_balance:', a.new_balance));
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
