'use strict';
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';

function fmt(n){ return parseFloat(n||0).toFixed(8); }

(async () => {
  // 1. Sum FEE-type wallet_transactions logged for the company wallet
  const { data: feeTx } = await db.from('wallet_transactions').select('amount_btc,amount_usdt,currency,status,created_at').eq('user_id', COMPANY_WALLET_ID).eq('type','FEE');
  let btcFromTx = 0, usdtFromTx = 0, confirmedCount=0, totalCount=(feeTx||[]).length;
  for (const t of feeTx||[]) {
    if (t.status !== 'CONFIRMED') continue;
    confirmedCount++;
    if (t.currency === 'USDT') usdtFromTx += parseFloat(t.amount_usdt||0);
    else btcFromTx += parseFloat(t.amount_btc||0);
  }
  console.log(`FEE wallet_transactions rows: ${totalCount} (confirmed: ${confirmedCount})`);
  console.log(`  Sum BTC fees logged:  ${fmt(btcFromTx)}`);
  console.log(`  Sum USDT fees logged: ${usdtFromTx.toFixed(6)}`);

  // 2. company_profits table
  const { data: profits, error: pErr } = await db.from('company_profits').select('profit_btc,profit_usdt,profit_usd,status');
  if (pErr) console.log('company_profits error:', pErr.message);
  else {
    let btcP=0, usdtP=0, usdP=0, collected=0;
    for (const p of profits||[]) {
      if (p.status !== 'COLLECTED') continue;
      collected++;
      btcP += parseFloat(p.profit_btc||0);
      usdtP += parseFloat(p.profit_usdt||0);
      usdP += parseFloat(p.profit_usd||0);
    }
    console.log(`company_profits COLLECTED rows: ${collected} / ${(profits||[]).length}`);
    console.log(`  Sum profit_btc:  ${fmt(btcP)}`);
    console.log(`  Sum profit_usdt: ${usdtP.toFixed(6)}`);
    console.log(`  Sum profit_usd:  ${usdP.toFixed(2)}`);
  }

  // 3. trades table platform_fee_btc / platform_fee_usdt where fee_status='COLLECTED'
  const { count: tradeCountBtc } = await db.from('trades').select('*',{count:'exact',head:true}).eq('fee_status','COLLECTED').gt('platform_fee_btc',0);
  const { data: feeTrades, error: ftErr } = await db.from('trades').select('platform_fee_btc, platform_fee_usdt, fee_status, currency').eq('fee_status','COLLECTED');
  if (ftErr) console.log('trades fee query error:', ftErr.message);
  else {
    let btcT=0, usdtT=0;
    for (const t of feeTrades||[]) { btcT += parseFloat(t.platform_fee_btc||0); usdtT += parseFloat(t.platform_fee_usdt||0); }
    console.log(`trades with fee_status=COLLECTED: ${(feeTrades||[]).length}`);
    console.log(`  Sum platform_fee_btc:  ${fmt(btcT)}`);
    console.log(`  Sum platform_fee_usdt: ${usdtT.toFixed(6)}`);
  }

  const { count: failedFeeCount } = await db.from('trades').select('*',{count:'exact',head:true}).eq('fee_status','FAILED');
  console.log(`trades with fee_status=FAILED (fee never collected): ${failedFeeCount}`);

  const { count: totalCompletedTrades } = await db.from('trades').select('*',{count:'exact',head:true}).eq('status','COMPLETED');
  console.log(`total COMPLETED trades: ${totalCompletedTrades}`);
})();
