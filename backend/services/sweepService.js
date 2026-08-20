// services/sweepService.js
// PRAQEN — Deposit Sweeper (Safe, Silent, Automatic)
//
// WHAT it does:
//   Every 30 minutes it scans every user deposit address for real on-chain BTC.
//   If an address has spendable UTXOs it moves that BTC to the platform hot wallet.
//   The hot wallet then funds all external user withdrawals.
//
// WHAT it NEVER does:
//   - Never changes any user DB balance (wallets / user_balances / user_wallets)
//   - Never throws errors that reach users
//   - Never sweeps the same address twice at the same time
//   - Never sweeps amounts below the dust minimum
//
// SAFETY model:
//   If the sweep TX broadcasts but logging fails → no funds are lost, UTXOs are gone
//   from the user address and now live in the hot wallet. The next cycle will find
//   zero UTXOs and skip cleanly.
//   If the sweep TX fails to broadcast → UTXOs stay at user address, try again next cycle.

require('dotenv').config();
const hdWallet        = require('./hdWalletService');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SWEEP_INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes
const SWEEP_MIN_SATS    = 10000;           // 0.0001 BTC minimum — never sweep dust
const FEE_RATE_SATS     = 5;              // 5 sat/vbyte — economical, reliable

class SweepService {
  constructor() {
    this.isRunning     = false;
    this.intervalId    = null;
    this._inProgress   = new Set(); // prevents double-sweep of same address
  }

  // ── Start background sweeper ───────────────────────────────────────────────
  start() {
    if (this.isRunning) {
      console.log('[SweepService] Already running — skipping duplicate start');
      return;
    }
    this.isRunning = true;

    const hotAddress = hdWallet.getHotWalletAddress();
    console.log('\n🧹 SweepService started');
    console.log(`   Hot wallet : ${hotAddress}`);
    console.log(`   Min sweep  : ${SWEEP_MIN_SATS / 1e8} BTC (${SWEEP_MIN_SATS} sats)`);
    console.log(`   Interval   : every ${SWEEP_INTERVAL_MS / 60000} minutes\n`);

    // First run after 2 minutes (let deposit monitor complete its startup cycle first)
    setTimeout(() => {
      this._runCycle();
      this.intervalId = setInterval(() => this._runCycle(), SWEEP_INTERVAL_MS);
    }, 2 * 60 * 1000);
  }

  stop() {
    clearInterval(this.intervalId);
    this.isRunning = false;
    console.log('[SweepService] Stopped');
  }

  // ── Full sweep cycle ───────────────────────────────────────────────────────
  async _runCycle() {
    console.log(`\n[SweepService] ⏱  Cycle start ${new Date().toISOString()}`);
    try {
      const hotAddress = hdWallet.getHotWalletAddress();

      // Get all user deposit addresses from user_wallets (last_onchain_btc is the
      // amount DepositMonitor has already credited to the user's wallets balance —
      // needed below so we never sweep BTC ahead of it being credited).
      let { data: wallets, error } = await supabaseAdmin
        .from('user_wallets')
        .select('user_id, btc_address, last_onchain_btc')
        .not('btc_address', 'is', null)
        .neq('btc_address', '');

      // Same fallback DepositMonitor uses if the column isn't migrated yet — don't
      // let a missing column stop the whole cycle from sweeping anyone.
      if (error) {
        console.warn('[SweepService] last_onchain_btc column missing — retrying without it:', error.message);
        const retry = await supabaseAdmin
          .from('user_wallets')
          .select('user_id, btc_address')
          .not('btc_address', 'is', null)
          .neq('btc_address', '');
        wallets = retry.data;
        error   = retry.error;
      }

      if (error) {
        console.error('[SweepService] Could not load user wallets:', error.message);
        return;
      }

      if (!wallets || wallets.length === 0) {
        console.log('[SweepService] No user deposit addresses found — nothing to sweep');
        return;
      }

      // Also pick up addresses from users table (fallback for older accounts)
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, bitcoin_wallet_address')
        .not('bitcoin_wallet_address', 'is', null)
        .neq('bitcoin_wallet_address', '');

      // Merge both sources, deduplicate by address
      const seen      = new Set();
      const toSweep   = [];

      for (const w of wallets) {
        if (w.btc_address && !seen.has(w.btc_address) && w.btc_address !== hotAddress) {
          seen.add(w.btc_address);
          toSweep.push({ userId: w.user_id, address: w.btc_address, lastOnchainBtc: w.last_onchain_btc });
        }
      }
      for (const u of (users || [])) {
        if (u.bitcoin_wallet_address && !seen.has(u.bitcoin_wallet_address) && u.bitcoin_wallet_address !== hotAddress) {
          seen.add(u.bitcoin_wallet_address);
          // No user_wallets row for these (legacy accounts) — lastOnchainBtc is
          // resolved from wallet_transactions inside _sweepOne, same fallback
          // DepositMonitor itself uses when the column/row is missing.
          toSweep.push({ userId: u.id, address: u.bitcoin_wallet_address, lastOnchainBtc: null });
        }
      }

      console.log(`[SweepService] Scanning ${toSweep.length} address(es)...`);

      let sweptCount  = 0;
      let totalSwept  = 0;

      for (const entry of toSweep) {
        // Throttle — 1 address every 2.5 seconds to respect mempool.space rate limits
        await this._sleep(2500);

        try {
          const sweptBtc = await this._sweepOne(entry.userId, entry.address, hotAddress, entry.lastOnchainBtc);
          if (sweptBtc > 0) {
            sweptCount++;
            totalSwept += sweptBtc;
          }
        } catch (err) {
          // One address failing NEVER stops the rest — silent
          console.error(`[SweepService] ⚠️  Could not sweep ${entry.address.slice(0, 20)}…:`, err.message);
        }
      }

      if (sweptCount > 0) {
        console.log(`[SweepService] ✅ Done — swept ${sweptCount} address(es), ₿${totalSwept.toFixed(8)} moved to hot wallet`);
      } else {
        console.log(`[SweepService] ✅ Cycle complete — no addresses needed sweeping`);
      }

    } catch (err) {
      // Outer guard — the entire cycle should NEVER crash the server
      console.error('[SweepService] Cycle error (non-fatal):', err.message);
    }
  }

  // ── Sweep one address to the hot wallet ───────────────────────────────────
  // Returns the amount swept in BTC, or 0 if nothing was swept.
  // lastOnchainBtc: what DepositMonitor has already credited to this user's wallets
  // balance for this address (undefined = caller didn't look it up — resolve here).
  async _sweepOne(userId, fromAddress, hotAddress, lastOnchainBtc) {
    // Prevent concurrent sweeps of the same address
    if (this._inProgress.has(fromAddress)) {
      console.log(`[SweepService] ${fromAddress.slice(0, 20)}… already sweeping — skipping`);
      return 0;
    }
    this._inProgress.add(fromAddress);

    try {
      // Step 1 — Get UTXOs at this address
      const utxos = await hdWallet.getUTXOs(fromAddress);
      if (!utxos || utxos.length === 0) return 0;

      // Step 1b — Never sweep BTC that DepositMonitor hasn't credited to the user's
      // wallets balance yet. Sweeping moves the UTXOs off this address, so once swept
      // the on-chain balance drops back down and DepositMonitor's "new deposit"
      // comparison (blockchainBTC vs last_onchain_btc) can never see it again — the
      // deposit is credited nowhere. This raced in production: SweepService's
      // independent 30-min cycle swept a user's deposit before DepositMonitor's own
      // cycle had credited it, leaving the on-chain BTC safely in the hot wallet but
      // the user's wallets.balance_btc permanently at 0 until manually corrected.
      const totalSatsOnChain = utxos.reduce((sum, u) => sum + u.value, 0);
      const onChainBtc       = parseFloat((totalSatsOnChain / 1e8).toFixed(8));
      let creditedBtc = lastOnchainBtc;
      if (creditedBtc === null || creditedBtc === undefined) {
        const { data: dtxs } = await supabaseAdmin
          .from('wallet_transactions')
          .select('amount_btc')
          .eq('user_id', userId)
          .eq('type', 'DEPOSIT');
        creditedBtc = (dtxs || []).reduce((s, t) => s + parseFloat(t.amount_btc || 0), 0);
      }
      creditedBtc = parseFloat((creditedBtc || 0).toFixed(8));
      if (onChainBtc > creditedBtc + 0.000000009) {
        console.log(`[SweepService] ${fromAddress.slice(0, 20)}… has ₿${onChainBtc} on-chain but only ₿${creditedBtc} credited — waiting for DepositMonitor to credit before sweeping`);
        return 0;
      }

      // Step 2 — Calculate how much we can sweep after network fee
      const totalSats     = totalSatsOnChain;
      // hdWallet.sendBitcoin() always budgets for 2 outputs (destination + possible
      // change, in case the sweep amount doesn't consume the exact UTXO value) — this
      // pre-check must match that assumption or it can underestimate the fee sendBitcoin
      // will actually require, causing every sweep of that address to fail forever
      // with "Not enough to cover fee" (confirmed happening: a 155-sat shortfall).
      const estimatedSize = 110 + (68 * utxos.length) + (31 * 2);
      const feeSats       = estimatedSize * FEE_RATE_SATS;
      const sendSats      = totalSats - feeSats;

      // Step 3 — Skip if below minimum (dust protection)
      if (sendSats < SWEEP_MIN_SATS) {
        if (totalSats > 0) {
          console.log(`[SweepService] ${fromAddress.slice(0, 20)}… has ${totalSats} sats but after fee (${feeSats} sats) only ${sendSats} sats remain — below minimum, skipping`);
        }
        return 0;
      }

      const sendBtc = parseFloat((sendSats / 1e8).toFixed(8));

      console.log(`[SweepService] Sweeping ${fromAddress.slice(0, 20)}… | ${totalSats} sats → ₿${sendBtc} after ${feeSats} sat fee`);

      // Step 4 — Broadcast the sweep transaction
      // sendBitcoin uses identifier 'user_${userId}' to derive the private key
      // that controls fromAddress — fully deterministic from the MNEMONIC
      const result = await hdWallet.sendBitcoin(
        `user_${userId}`,
        hotAddress,
        sendBtc,
        FEE_RATE_SATS
      );

      console.log(`[SweepService] ✅ Swept ₿${sendBtc} | TX: ${result.txid}`);
      console.log(`[SweepService]    Explorer: ${result.explorer_url}`);

      // Step 5 — Log the sweep for audit trail (SWEEP type is hidden from users)
      // This NEVER modifies any user balance — it is purely informational
      await supabaseAdmin.from('wallet_transactions').insert({
        user_id:             userId,
        type:                'SWEEP',
        amount_btc:          sendBtc,
        status:              'CONFIRMED',
        tx_hash:             result.txid,
        destination_address: hotAddress,
        notes:               `Auto-sweep to hot wallet — tx: ${result.txid}`,
        created_at:          new Date().toISOString(),
      }).then(null, logErr => {
        // Logging failure is non-fatal — the BTC is already safely in hot wallet.
        // NOTE: Supabase's query builder is thenable but not a real Promise, so
        // .catch() throws "is not a function" instead of catching — .then(null, fn)
        // works on both. That bug was previously making every successful sweep log
        // as "Could not sweep" even though the BTC had already been sent correctly.
        console.warn('[SweepService] Audit log failed (funds safe):', logErr.message);
      });

      return sendBtc;

    } finally {
      // Always release the lock, even if an error occurred
      this._inProgress.delete(fromAddress);
    }
  }

  // ── Manually sweep a single user (called right after a deposit is confirmed) ─
  async sweepUser(userId) {
    try {
      const { data: wallet } = await supabaseAdmin
        .from('user_wallets')
        .select('btc_address')
        .eq('user_id', userId)
        .maybeSingle();

      if (!wallet?.btc_address) return;

      const hotAddress = hdWallet.getHotWalletAddress();
      await this._sweepOne(userId, wallet.btc_address, hotAddress);
    } catch (err) {
      // Never let a sweep failure surface to users
      console.error(`[SweepService] sweepUser error for ${userId.slice(0, 8)}:`, err.message);
    }
  }

  getStatus() {
    return {
      running:          this.isRunning,
      interval_minutes: SWEEP_INTERVAL_MS / 60000,
      min_sweep_btc:    SWEEP_MIN_SATS / 1e8,
      in_progress:      this._inProgress.size,
      hot_wallet:       hdWallet.getHotWalletAddress(),
    };
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new SweepService();
