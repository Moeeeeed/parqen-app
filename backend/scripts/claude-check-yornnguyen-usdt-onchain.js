// READ-ONLY. Pull the full TRC20-USDT transfer history for yornnguyen's deposit
// address straight from TronGrid, so we can see every inbound/outbound transfer,
// amount and timestamp. No writes. GET requests only.
'use strict';
require('dotenv').config();
const axios = require('axios');

const ADDRESS = 'TLxhn1tENAiYHzgqeWUXW6NbynvgSzpdWt';
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

(async () => {
  console.log(`TRC20 USDT history for ${ADDRESS}  (READ-ONLY) — ${new Date().toISOString()}`);
  console.log('='.repeat(90));

  // current balance
  try {
    const { data } = await axios.get(`https://api.trongrid.io/v1/accounts/${ADDRESS}`, { timeout: 15000 });
    const trc = (data?.data?.[0]?.trc20 || []).find(o => o[USDT_CONTRACT] != null);
    const raw = trc ? trc[USDT_CONTRACT] : '0';
    console.log(`current on-chain USDT balance: $${(Number(raw) / 1e6).toFixed(6)}`);
  } catch (e) { console.log('balance fetch error: ' + e.message); }

  let url = `https://api.trongrid.io/v1/accounts/${ADDRESS}/transactions/trc20?limit=100&contract_address=${USDT_CONTRACT}&order_by=block_timestamp,asc`;
  let page = 0;
  let totalIn = 0, totalOut = 0;
  while (url && page < 20) {
    page++;
    const { data } = await axios.get(url, { timeout: 20000 });
    const rows = data?.data || [];
    for (const t of rows) {
      const amt = Number(t.value) / 1e6;
      const dir = t.to === ADDRESS ? 'IN ' : (t.from === ADDRESS ? 'OUT' : ' ? ');
      if (dir === 'IN ') totalIn += amt;
      if (dir === 'OUT') totalOut += amt;
      console.log(
        `${new Date(t.block_timestamp).toISOString()} | ${dir} | $${amt.toFixed(6)} | ` +
        `from ${t.from} -> ${t.to} | tx ${t.transaction_id}`
      );
    }
    url = data?.meta?.links?.next || null;
  }
  console.log('-'.repeat(90));
  console.log(`total IN : $${totalIn.toFixed(6)}`);
  console.log(`total OUT: $${totalOut.toFixed(6)}`);
  console.log(`net (should equal current balance): $${(totalIn - totalOut).toFixed(6)}`);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.response?.data || e.message); process.exit(1); });
