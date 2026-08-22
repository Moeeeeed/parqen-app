// Read-only audit: for every user who has ever had a completed sweep (USDT or BTC),
// check whether their current on-chain balance + everything already swept exceeds
// what has actually been credited to their PRAQEN ledger. A gap means the same
// last_onchain_* checkpoint-drift bug under-credited a later deposit. NO WRITES.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('../services/tronWalletService');
const hdWallet = require('../services/hdWalletService');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function auditUsdt(userId, username) {
  const { data: uw } = await db.from('user_wallets').select('tron_address').eq('user_id', userId).maybeSingle();
  if (!uw?.tron_address) return null;

  const { data: sweeps } = await db.from('hot_wallet_sweeps').select('amount_usdt').eq('user_id', userId).eq('status', 'COMPLETED');
  const totalSwept = (sweeps || []).reduce((s, r) => s + parseFloat(r.amount_usdt || 0), 0);

  let onchain;
  try {
    onchain = await tronWallet.getUSDTBalance(uw.tron_address);
  } catch (e) {
    return { userId, username, currency: 'USDT', error: e.message };
  }

  const totalEverReceived = parseFloat((onchain + totalSwept).toFixed(6));

  const { data: txs } = await db.from('wallet_transactions').select('type,amount_usdt')
    .eq('user_id', userId).eq('currency', 'USDT').in('type', ['DEPOSIT', 'ADJUSTMENT']);
  const totalCredited = parseFloat(((txs || []).reduce((s, t) => s + parseFloat(t.amount_usdt || 0), 0)).toFixed(6));

  const shortfall = parseFloat((totalEverReceived - totalCredited).toFixed(6));
  return { userId, username, currency: 'USDT', address: uw.tron_address, onchain, totalSwept, totalEverReceived, totalCredited, shortfall };
}

async function auditBtc(userId, username) {
  const { data: uw } = await db.from('user_wallets').select('btc_address').eq('user_id', userId).maybeSingle();
  if (!uw?.btc_address) return null;

  const { data: sweepTxs } = await db.from('wallet_transactions').select('amount_btc').eq('user_id', userId).eq('type', 'SWEEP');
  const totalSwept = (sweepTxs || []).reduce((s, r) => s + parseFloat(r.amount_btc || 0), 0);

  let utxos;
  try {
    utxos = await hdWallet.getUTXOs(uw.btc_address, { throwOnError: true });
  } catch (e) {
    return { userId, username, currency: 'BTC', error: e.message };
  }
  const onchain = parseFloat(((utxos || []).reduce((s, u) => s + u.value, 0) / 1e8).toFixed(8));

  const totalEverReceived = parseFloat((onchain + totalSwept).toFixed(8));

  const { data: txs } = await db.from('wallet_transactions').select('amount_btc')
    .eq('user_id', userId).eq('type', 'DEPOSIT');
  const totalCredited = parseFloat(((txs || []).reduce((s, t) => s + parseFloat(t.amount_btc || 0), 0)).toFixed(8));

  const shortfall = parseFloat((totalEverReceived - totalCredited).toFixed(8));
  return { userId, username, currency: 'BTC', address: uw.btc_address, onchain, totalSwept, totalEverReceived, totalCredited, shortfall };
}

(async () => {
  const { data: usdtSweptUsers } = await db.from('hot_wallet_sweeps').select('user_id').eq('status', 'COMPLETED');
  const { data: btcSweptUsers } = await db.from('wallet_transactions').select('user_id').eq('type', 'SWEEP');

  const usdtIds = [...new Set((usdtSweptUsers || []).map(r => r.user_id))];
  const btcIds  = [...new Set((btcSweptUsers || []).map(r => r.user_id))];
  const allIds  = [...new Set([...usdtIds, ...btcIds])];

  const { data: users } = await db.from('users').select('id, username').in('id', allIds);
  const nameMap = {};
  (users || []).forEach(u => nameMap[u.id] = u.username);

  console.log(`Auditing ${usdtIds.length} USDT-swept user(s) and ${btcIds.length} BTC-swept user(s) (${allIds.length} unique)...\n`);

  const results = [];

  for (const userId of usdtIds) {
    const r = await auditUsdt(userId, nameMap[userId] || userId.slice(0, 8));
    if (r) results.push(r);
    await sleep(600);
  }

  for (const userId of btcIds) {
    const r = await auditBtc(userId, nameMap[userId] || userId.slice(0, 8));
    if (r) results.push(r);
    await sleep(2600);
  }

  console.log('\n=== FULL RESULTS ===');
  results.forEach(r => {
    if (r.error) {
      console.log(`  [${r.currency}] ${r.username} (${r.userId.slice(0,8)}) — ERROR: ${r.error}`);
    } else {
      const flag = Math.abs(r.shortfall) > (r.currency === 'BTC' ? 0.00001 : 0.01) ? '🚨 MISMATCH' : 'OK';
      console.log(`  [${r.currency}] ${r.username} (${r.userId.slice(0,8)}) | onchain=${r.onchain} swept=${r.totalSwept} everReceived=${r.totalEverReceived} credited=${r.totalCredited} shortfall=${r.shortfall} — ${flag}`);
    }
  });

  const flagged = results.filter(r => !r.error && Math.abs(r.shortfall) > (r.currency === 'BTC' ? 0.00001 : 0.01));
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total checked: ${results.length}`);
  console.log(`Flagged mismatches: ${flagged.length}`);
  flagged.forEach(r => console.log(`  🚨 ${r.username} (${r.userId}) — ${r.currency} shortfall: ${r.shortfall}`));

  require('fs').writeFileSync(
    require('path').join(__dirname, 'audit-swept-users-result.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\nFull results written to scripts/audit-swept-users-result.json');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
