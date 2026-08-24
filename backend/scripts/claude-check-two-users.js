// READ-ONLY check for specific users reporting undetected BTC deposits.
// No writes anywhere.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const usernames = ['ukbuyer2022', 'yornnguyen'];

async function fetchBtcAddress(address) {
  const resp = await axios.get(`https://blockstream.info/api/address/${address}`, { timeout: 10000 });
  return resp.data;
}

(async () => {
  for (const uname of usernames) {
    console.log(`\n========== ${uname} ==========`);
    const { data: user, error: uErr } = await supa
      .from('users')
      .select('id, username, email, bitcoin_wallet_address')
      .ilike('username', uname)
      .maybeSingle();

    if (uErr || !user) {
      console.log('  User lookup failed:', uErr?.message || 'not found');
      continue;
    }
    console.log('  user_id:', user.id, '| email:', user.email);

    const { data: uw } = await supa
      .from('user_wallets')
      .select('user_id, btc_address, last_onchain_btc, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: wal } = await supa
      .from('wallets')
      .select('balance_btc, locked_balance_btc, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: txs } = await supa
      .from('wallet_transactions')
      .select('type, amount_btc, status, notes, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const address = uw?.btc_address || user.bitcoin_wallet_address;
    console.log('  btc_address:', address);
    console.log('  user_wallets.last_onchain_btc:', uw?.last_onchain_btc, '| updated_at:', uw?.updated_at);
    console.log('  wallets.balance_btc:', wal?.balance_btc, '| locked:', wal?.locked_balance_btc, '| updated_at:', wal?.updated_at);
    console.log('  recent wallet_transactions:');
    (txs || []).forEach(t => console.log('   -', t.created_at, t.type, t.amount_btc, t.status, t.notes || ''));

    if (address) {
      try {
        const addrData = await fetchBtcAddress(address);
        const cs = addrData?.chain_stats || {};
        const mp = addrData?.mempool_stats || {};
        const confirmedSats = (cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0);
        const confirmedBtc = confirmedSats / 1e8;
        const mempoolSats = (mp.funded_txo_sum || 0) - (mp.spent_txo_sum || 0);
        const mempoolBtc = mempoolSats / 1e8;
        const lastKnown = parseFloat(uw?.last_onchain_btc || 0);
        console.log(`  ON-CHAIN confirmed balance: ${confirmedBtc} BTC`);
        console.log(`  MEMPOOL (unconfirmed) balance: ${mempoolBtc} BTC`);
        console.log(`  Undetected (confirmed - last_onchain_btc): ${(confirmedBtc - lastKnown).toFixed(8)} BTC`);
        if (confirmedBtc > lastKnown + 0.000000009) {
          console.log('  >>> FLAG: on-chain confirmed balance exceeds last recorded — deposit NOT yet credited!');
        } else if (mempoolBtc !== 0) {
          console.log('  >>> Unconfirmed tx pending in mempool — waiting on confirmations.');
        } else {
          console.log('  No discrepancy detected between on-chain and recorded balance.');
        }
      } catch (e) {
        console.log('  Error fetching on-chain data:', e.response?.status, e.message);
      }
    } else {
      console.log('  No BTC address on file for this user.');
    }
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
