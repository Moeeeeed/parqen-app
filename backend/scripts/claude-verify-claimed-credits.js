// READ-ONLY verification of claims: (1) all 3 migration RPCs now exist,
// (2) king888/kingkong79-pro/ukbuyer2022 were actually credited. SELECT-only
// + the same side-effect-free RPC-existence diagnostics used all session.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const USERS = {
  king888:        { id: null, username: 'king888' },
  'kingkong79-pro': { id: null, username: 'kingkong79-pro' },
  ukbuyer2022:    { id: '19563f83-e4dd-468e-8bfe-47220cc23bb0' }, // already known
};

const KNOWN_TX_HASHES = {
  king888: ['cc26732490c72447953859c640821a4b042851473121b9ee466265f888c49eec', 'eea66cf8d0ebb7fc911400a40e1cf5e9cb5199eca8c903cbd1472ffc2dce7801'],
  ukbuyer2022: ['c22d36bd0c36b655baf62cc9c4bfdb53a83daf3d1dfce82867384ed2d163e5c0'],
};

(async () => {
  console.log('=== 1. RPC existence status ===');
  const checks = [
    ['praqen_credit_deposit', { p_user_id: '00000000-0000-0000-0000-000000000000', p_currency: 'USDT', p_amount: 0.000001, p_onchain_balance: 0, p_idempotency_key: 'v-' + Date.now(), p_note: 'check' }],
    ['praqen_internal_transfer', { p_sender_id: '00000000-0000-0000-0000-000000000000', p_recipient_id: '00000000-0000-0000-0000-000000000001', p_currency: 'USDT', p_amount: 0.000001, p_idempotency_key: 'v-' + Date.now(), p_note: 'check' }],
    ['praqen_reject_withdrawal', { p_tx_id: '00000000-0000-0000-0000-000000000000', p_ceo_id: '00000000-0000-0000-0000-000000000000', p_reason: 'check' }],
  ];
  for (const [fn, params] of checks) {
    const { error } = await supa.rpc(fn, params);
    if (!error) console.log(`  ${fn}: unexpected success`);
    else if (error.code === 'PGRST202') console.log(`  ${fn}: MISSING (PGRST202)`);
    else console.log(`  ${fn}: EXISTS — [${error.code}] ${error.message}`);
  }

  console.log('\n=== 2. Were king888 / kingkong79-pro / ukbuyer2022 actually credited? ===');
  for (const [label, info] of Object.entries(USERS)) {
    let userId = info.id;
    if (!userId) {
      const { data: u } = await supa.from('users').select('id').ilike('username', info.username).maybeSingle();
      userId = u?.id;
    }
    if (!userId) { console.log(`\n${label}: user not found`); continue; }

    const { data: wal } = await supa.from('wallets').select('balance_btc, balance_usdt, updated_at').eq('user_id', userId).maybeSingle();
    console.log(`\n${label} (user_id=${userId}):`);
    console.log('  current wallets:', wal);

    const hashes = KNOWN_TX_HASHES[label] || [];
    for (const hash of hashes) {
      const { data: rows } = await supa.from('wallet_transactions').select('type, amount_btc, amount_usdt, status, created_at, notes').eq('user_id', userId).eq('tx_hash', hash);
      console.log(`  wallet_transactions referencing ${hash.slice(0,16)}...: ${(rows||[]).length} row(s)`, rows || []);
    }

    // For kingkong79-pro (USDT case), check by content since no specific tx_hash was ever recorded on our side
    if (label === 'kingkong79-pro') {
      const { data: recentDeposits } = await supa.from('wallet_transactions').select('type, amount_usdt, status, notes, created_at').eq('user_id', userId).eq('type', 'DEPOSIT').eq('currency', 'USDT').order('created_at', { ascending: false }).limit(5);
      console.log('  recent USDT DEPOSIT rows:', recentDeposits || []);
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
