// READ-ONLY. SELECT-only. No writes, no RPC. Summary numbers for hidil55555.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const f8 = n => Number(n||0).toFixed(8);
(async () => {
  const { data: u } = await supa.from('users').select('id').ilike('username','hidil55555').maybeSingle();
  const { data: wal } = await supa.from('wallets').select('balance_btc,locked_balance_btc').eq('user_id',u.id).maybeSingle();
  const { data: buy } = await supa.from('trades').select('id,status,fee_status,amount_btc,amount_usd,created_at').eq('buyer_id',u.id);
  const { data: sell } = await supa.from('trades').select('id,status,fee_status,amount_btc,amount_usd,created_at').eq('seller_id',u.id);
  const grp = arr => arr.reduce((m,t)=>{ (m[t.status]=m[t.status]||{n:0,btc:0,usd:0}); m[t.status].n++; m[t.status].btc+=+t.amount_btc||0; m[t.status].usd+=+t.amount_usd||0; return m; },{});
  console.log('wallets.balance_btc =', f8(wal.balance_btc), '| locked =', f8(wal.locked_balance_btc));
  console.log('\n--- trades as SELLER:', sell.length, '---');
  console.dir(grp(sell), {depth:null});
  console.log('total seller btc (all):', f8(sell.reduce((s,t)=>s+(+t.amount_btc||0),0)), '| usd:', sell.reduce((s,t)=>s+(+t.amount_usd||0),0).toFixed(2));
  console.log('\n--- trades as BUYER:', buy.length, '---');
  console.dir(grp(buy), {depth:null});
  const done = s => s.filter(t => ['COMPLETED','RELEASED'].includes(String(t.status).toUpperCase()));
  console.log('\ncompleted SELLER trades:', done(sell).length, '| btc delivered:', f8(done(sell).reduce((s,t)=>s+(+t.amount_btc||0),0)), '| usd:', done(sell).reduce((s,t)=>s+(+t.amount_usd||0),0).toFixed(2));
  console.log('completed BUYER trades:', done(buy).length, '| btc:', f8(done(buy).reduce((s,t)=>s+(+t.amount_btc||0),0)));
  // deposits from ledger
  const { data: dep } = await supa.from('wallet_transactions').select('amount_btc,status,created_at,idempotency_key,description').eq('user_id',u.id).eq('type','DEPOSIT').order('created_at',{ascending:true});
  console.log('\n--- DEPOSIT ledger rows ---');
  dep.forEach(d => console.log(' ', d.created_at, '|', String(d.status).padEnd(9), '|', f8(d.amount_btc), '|', d.idempotency_key||'(no key)'));
  const conf = dep.filter(d => String(d.status).toUpperCase()==='CONFIRMED');
  console.log('confirmed deposit rows sum:', f8(conf.reduce((s,d)=>s+(+d.amount_btc||0),0)));
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
