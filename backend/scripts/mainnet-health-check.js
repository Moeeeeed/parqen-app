// scripts/mainnet-health-check.js
// PRAQEN Mainnet Health Check & Readiness Diagnostic Tool
'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWallet = require('../services/hdWalletService');
const tronWallet = require('../services/tronWalletService');
const tronConfig = require('../services/tronConfig');
const tronHotWallet = require('../services/tronHotWallet');
const btcApiGateway = require('../services/btcApiGateway');

const hr = (char = '=') => console.log(char.repeat(80));

async function runMainnetHealthCheck() {
  hr();
  console.log('🚀 PRAQEN MAINNET HEALTH CHECK & READINESS DIAGNOSTIC');
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(`   Node Env : ${process.env.NODE_ENV || 'development'}`);
  hr();

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  function report(category, name, passed, details = '', isWarn = false) {
    if (passed) {
      console.log(`  ✅ [${category}] ${name}: ${details || 'OK'}`);
      passCount++;
    } else if (isWarn) {
      console.log(`  ⚠️  [${category}] ${name}: ${details}`);
      warnCount++;
    } else {
      console.log(`  ❌ [${category}] ${name}: ${details}`);
      failCount++;
    }
  }

  // 1. Environment & Config
  console.log('\n[1] Network & Environment Configuration');
  report('ENV', 'HD_NETWORK', process.env.HD_NETWORK === 'mainnet', `Value = "${process.env.HD_NETWORK}"`);
  report('ENV', 'TRON_NETWORK', (process.env.TRON_NETWORK || '').toLowerCase() === 'mainnet', `Value = "${process.env.TRON_NETWORK}"`);
  report('ENV', 'TRONGRID_API_KEY', Boolean(process.env.TRONGRID_API_KEY), process.env.TRONGRID_API_KEY ? 'Present' : 'Missing (Recommended)');
  report('ENV', 'SUPABASE_URL', Boolean(process.env.SUPABASE_URL), process.env.SUPABASE_URL || 'Missing');
  report('ENV', 'SUPABASE_SERVICE_ROLE_KEY', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');

  // 2. Bitcoin HD Wallet Mainnet Checks
  console.log('\n[2] Bitcoin HD Wallet (Mainnet Native SegWit)');
  try {
    hdWallet.initialize();
    const btcNetwork = hdWallet.getNetwork();
    report('BTC', 'Network Setting', btcNetwork === 'mainnet', `Active network: ${btcNetwork}`);
    report('BTC', 'API Endpoint', hdWallet.apiBase === 'https://mempool.space/api', `Base: ${hdWallet.apiBase}`);

    const hotBtc = hdWallet.getHotWalletAddress();
    const feeBtc = hdWallet.getPraqenFeeAddress();
    const reserveBtc = hdWallet.getReserveWalletAddress();
    const sampleUserBtc = hdWallet.generateUserAddress('test-sample-user-id').address;

    report('BTC', 'Hot Wallet Address', hotBtc.startsWith('bc1q'), `${hotBtc}`);
    report('BTC', 'Fee Wallet Address', feeBtc.startsWith('bc1q'), `${feeBtc}`);
    report('BTC', 'Reserve Wallet Address', reserveBtc.startsWith('bc1q'), `${reserveBtc}`);
    report('BTC', 'User Address Format (SegWit bc1q)', sampleUserBtc.startsWith('bc1q'), `${sampleUserBtc}`);

    // Live API check
    try {
      const liveHotUtxos = await btcApiGateway.get(`/address/${hotBtc}/utxo`, { priority: 'high', skipCache: true });
      const hotSatTotal = (liveHotUtxos || []).reduce((acc, u) => acc + (u.value || 0), 0);
      report('BTC', 'Mempool.space Live Connectivity', true, `Hot wallet on-chain balance: ${(hotSatTotal / 1e8).toFixed(8)} BTC (${hotSatTotal} sats, ${liveHotUtxos.length} UTXOs)`);
    } catch (apiErr) {
      report('BTC', 'Mempool.space Live Connectivity', false, `Error: ${apiErr.message}`);
    }
  } catch (btcErr) {
    report('BTC', 'Initialization', false, btcErr.message);
  }

  // 3. Tron / TRC-20 USDT Mainnet Checks
  console.log('\n[3] Tron & TRC-20 USDT (Mainnet)');
  try {
    tronWallet.initialize();
    report('TRON', 'Network Setting', !tronConfig.isTestnet && tronConfig.network === 'mainnet', `Config network: ${tronConfig.network} (isTestnet=${tronConfig.isTestnet})`);
    report('TRON', 'TronGrid URL', tronConfig.trongridUrl === 'https://api.trongrid.io', `${tronConfig.trongridUrl}`);
    report('TRON', 'USDT Contract', tronConfig.usdtContract === 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', `${tronConfig.usdtContract} (Official TRC-20 USDT)`);

    const hotTron = tronHotWallet.getHotWalletAddress();
    const companyTron = tronHotWallet.getCompanyTronAddress();
    const sampleUserTron = tronWallet.generateUserAddress('test-sample-user-id').address;

    report('TRON', 'Hot Wallet Address', tronWallet.isValidTronAddress(hotTron), `${hotTron}`);
    report('TRON', 'Company Tron Address', tronWallet.isValidTronAddress(companyTron), `${companyTron}`);
    report('TRON', 'User Tron Address Format', tronWallet.isValidTronAddress(sampleUserTron), `${sampleUserTron}`);

    // Query on-chain balances
    try {
      const [hotUsdt, hotTrx] = await Promise.all([
        tronHotWallet.getUsdtBalance().catch(e => `Error: ${e.message}`),
        tronHotWallet.getTrxBalance().catch(e => `Error: ${e.message}`),
      ]);

      const isUsdtNum = typeof hotUsdt === 'number';
      const isTrxNum = typeof hotTrx === 'number';

      report('TRON', 'Live TronGrid On-chain Check', isUsdtNum && isTrxNum, `Hot Wallet On-Chain -> USDT: ${hotUsdt} USDT | TRX (Gas): ${hotTrx} TRX`);

      if (isTrxNum && hotTrx < 20) {
        report('TRON', 'Hot Wallet Gas Funding', false, `TRX balance is ${hotTrx} TRX. (Send 20-50 TRX to ${hotTron} on Mainnet for automated sweeps/withdrawals)`, true);
      } else if (isTrxNum) {
        report('TRON', 'Hot Wallet Gas Funding', true, `TRX gas available: ${hotTrx} TRX`);
      }
    } catch (tronErr) {
      report('TRON', 'Live Query', false, tronErr.message);
    }
  } catch (tronInitErr) {
    report('TRON', 'Initialization', false, tronInitErr.message);
  }

  // 4. Supabase Database & User Address Sync Check
  console.log('\n[4] Supabase Database & User Address Synchronization');
  try {
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );

    const { data: users, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, username, bitcoin_wallet_address')
      .order('created_at', { ascending: true });

    if (userErr) {
      report('DB', 'Users Table', false, userErr.message);
    } else {
      report('DB', 'Users Table Query', true, `Found ${users.length} registered user(s)`);

      const { data: wallets, error: walErr } = await supabaseAdmin
        .from('user_wallets')
        .select('user_id, btc_address, tron_address, balance_btc');

      if (walErr) {
        report('DB', 'user_wallets Table', false, walErr.message);
      } else {
        const walletMap = new Map(wallets.map(w => [w.user_id, w]));
        let btcMismatchCount = 0;
        let testnetBtcCount = 0;
        let missingTronCount = 0;

        for (const u of users) {
          const expectedBtc = hdWallet.generateUserAddress(u.id).address;
          const expectedTron = tronWallet.generateUserAddress(u.id).address;
          const w = walletMap.get(u.id);

          if (u.bitcoin_wallet_address?.startsWith('tb1') || w?.btc_address?.startsWith('tb1')) {
            testnetBtcCount++;
          }
          if (w?.btc_address !== expectedBtc || u.bitcoin_wallet_address !== expectedBtc) {
            btcMismatchCount++;
          }
          if (!w?.tron_address || w.tron_address !== expectedTron) {
            missingTronCount++;
          }
        }

        if (testnetBtcCount > 0) {
          report('DB', 'Testnet BTC Addresses Detected', false, `${testnetBtcCount} user(s) still have testnet (tb1q...) addresses. Run node fix-all-user-addresses.js to migrate to mainnet bc1q...`, true);
        } else {
          report('DB', 'Testnet BTC Addresses Check', true, 'No testnet BTC addresses detected in DB');
        }

        if (btcMismatchCount > 0) {
          report('DB', 'BTC Address Sync Status', false, `${btcMismatchCount} user(s) need BTC address re-synchronization to mainnet.`, true);
        } else {
          report('DB', 'BTC Address Sync Status', true, `All ${users.length} user(s) have matching mainnet bc1q... addresses`);
        }

        if (missingTronCount > 0) {
          report('DB', 'Tron Address Sync Status', false, `${missingTronCount} user(s) missing or mismatched Tron address`, true);
        } else {
          report('DB', 'Tron Address Sync Status', true, `All ${users.length} user(s) have matching Tron T... addresses`);
        }
      }
    }
  } catch (dbErr) {
    report('DB', 'Supabase Connection', false, dbErr.message);
  }

  // Summary
  hr();
  console.log('📊 MAINNET READINESS SUMMARY:');
  console.log(`   ✅ Passed : ${passCount}`);
  console.log(`   ⚠️  Warnings: ${warnCount}`);
  console.log(`   ❌ Failed : ${failCount}`);
  hr();

  if (failCount === 0 && warnCount === 0) {
    console.log('🎉 100% READY FOR MAINNET TESTING!');
  } else if (failCount === 0) {
    console.log('⚠️  System is configured for Mainnet, but please review the advisory warnings above.');
  } else {
    console.log('❌ Please resolve the failures above before conducting live Mainnet transactions.');
  }
  hr();
}

runMainnetHealthCheck().catch(err => {
  console.error('Fatal error during health check:', err);
  process.exit(1);
});
