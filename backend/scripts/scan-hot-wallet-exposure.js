// backend/scripts/scan-hot-wallet-exposure.js
//
// READ-ONLY. Checks on-chain balances at the platform's hot/fee wallets (BTC + USDT)
// — the addresses that concentrate nearly all platform funds via the 30-minute
// auto-sweep (see services/sweepService.js). Makes zero writes, zero sends.
//
// Usage: node scripts/scan-hot-wallet-exposure.js

require('dotenv').config();
const hdWallet   = require('../services/hdWalletService');
const tronWallet = require('../services/tronWalletService');

const HOT_ID     = process.env.PRAQEN_HOT_WALLET_IDENTIFIER     || 'praqen_hot_wallet_main';
const COMPANY_ID = process.env.PRAQEN_COMPANY_WALLET_IDENTIFIER || 'praqen_company_wallet';

async function main() {
  console.log('=== BTC ===');
  const btcHotAddr = hdWallet.getHotWalletAddress();
  const btcFeeAddr = hdWallet.getPraqenFeeAddress();

  const btcHot = await hdWallet.checkBalance(btcHotAddr);
  console.log(`Hot wallet  (praqen_hot_withdrawal_wallet): ${btcHotAddr}`);
  console.log(`  confirmed: ${btcHot.confirmed_btc} BTC | unconfirmed: ${btcHot.unconfirmed_btc} BTC | source: ${btcHot.source || btcHot.error}`);

  const btcFee = await hdWallet.checkBalance(btcFeeAddr);
  console.log(`Fee wallet  (praqen_company_fee_wallet): ${btcFeeAddr}`);
  console.log(`  confirmed: ${btcFee.confirmed_btc} BTC | unconfirmed: ${btcFee.unconfirmed_btc} BTC | source: ${btcFee.source || btcFee.error}`);

  const btcReserve = await hdWallet.getReserveWalletBalance();
  console.log(`Reserve wallet (praqen_company_reserve_wallet): ${btcReserve.address}`);
  console.log(`  confirmed: ${btcReserve.confirmed_btc} BTC | unconfirmed: ${btcReserve.unconfirmed_btc} BTC | source: ${btcReserve.source || btcReserve.error}`);

  console.log('\n=== USDT (TRC-20) ===');
  const tronHotAddr = tronWallet.generateAddress(HOT_ID).address;
  const tronComAddr = tronWallet.generateAddress(COMPANY_ID).address;

  try {
    const usdtHot = await tronWallet.getUSDTBalance(tronHotAddr);
    console.log(`Hot wallet  (${HOT_ID}): ${tronHotAddr}`);
    console.log(`  balance: ${usdtHot} USDT`);
  } catch (e) {
    console.log(`Hot wallet  (${HOT_ID}): ${tronHotAddr}`);
    console.log(`  ERROR checking balance: ${e.message}`);
  }

  try {
    const usdtCom = await tronWallet.getUSDTBalance(tronComAddr);
    console.log(`Company wallet (${COMPANY_ID}): ${tronComAddr}`);
    console.log(`  balance: ${usdtCom} USDT`);
  } catch (e) {
    console.log(`Company wallet (${COMPANY_ID}): ${tronComAddr}`);
    console.log(`  ERROR checking balance: ${e.message}`);
  }

  console.log('\nDone. This covers the two addresses that concentrate ~all platform funds');
  console.log('via the 30-min auto-sweep. Run scan-user-address-exposure.js for the fuller');
  console.log('per-user residual scan (funds not yet swept, e.g. deposited in the last 30 min).');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
