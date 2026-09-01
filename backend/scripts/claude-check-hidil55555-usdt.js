// READ-ONLY. SELECT-only. Confirm whether hidil55555 ever brought in any USDT.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
(async () => {
  const { data: u } = await supa.from('users').select('id').ilike('username','hidil55555').maybeSingle();
  const { data: wal } = await supa.from('wallets').select('balance_btc,locked_balance_btc,balance_usdt,locked_balance_usdt,tron_address').eq('user_id',u.id).maybeSingle();
  const { data: uw } = await supa.from('user_wallets').select('tron_address,last_onchain_usdt,last_onchain_btc').eq('user_id',u.id).maybeSingle();
  console.log('wallets:', wal);
  console.log('user_wallets tron/checkpoints:', uw);
  const { data: usdtTx } = await supa.from('wallet_transactions').select('type,amount_usdt,currency,status,created_at').eq('user_id',u.id).or('currency.eq.USDT,amount_usdt.gt.0');
  console.log('\nUSDT-side wallet_transactions rows:', (usdtTx||[]).length);
  (usdtTx||[]).forEach(t=>console.log(' ', JSON.stringify(t)));
  const { data: sw } = await supa.from('swap_transactions').select('*').eq('user_id',u.id);
  console.log('swap_transactions:', (sw||[]).length);
  // trade currency check
  const { data: tr } = await supa.from('trades').select('crypto_type,asset,amount_btc,amount_usdt,amount_usd').or(`buyer_id.eq.${u.id},seller_id.eq.${u.id}`);
  const assets = {};
  (tr||[]).forEach(t=>{ const k = t.crypto_type||t.asset||'(btc-implied)'; assets[k]=(assets[k]||0)+1; });
  console.log('\ntrade asset/crypto_type breakdown:', assets);
  console.log('any trade with amount_usdt>0:', (tr||[]).some(t=>+t.amount_usdt>0));
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
