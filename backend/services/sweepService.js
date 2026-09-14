// services/sweepService.js
// PRAQEN — Deposit Sweeper (Safe, Silent, Automatic)
//
// WHAT it does:
//   Every SWEEP_INTERVAL_MS it scans every user deposit address for real
//   on-chain BTC. If an address has spendable UTXOs it moves that BTC to the
//   platform hot wallet. The hot wallet then funds all external user withdrawals.
//   depositMonitor.js also calls sweepUser() directly right after crediting a
//   deposit, so a freshly-credited address is swept within seconds — this
//   periodic full scan is the safety net for anything that trigger missed
//   (a manual credit, a restart, a transient error), not the primary path.
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
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // every 60 minutes (1 hour)
const SWEEP_MIN_SATS    = 10000;           // 0.0001 BTC minimum — never sweep dust
const FEE_RATE_SATS     = 5;              // 5 sat/vbyte — economical, reliable

// Hot wallet ceiling — anything above this gets auto-swept to the company
// reserve wallet at the end of every cycle. Set HOT_WALLET_CEILING_BTC in .env
// to whatever covers ~24-48h of expected withdrawal volume; this default is a
// conservative placeholder, not a business-tuned number — raise or lower it to
// match real volume. Reserve funds only ever come back via CEO-approved
// hdWallet.sendReserveToHot() — this direction (hot → reserve) is the only one
// safe to automate.
const HOT_WALLET_CEILING_BTC  = parseFloat(process.env.HOT_WALLET_CEILING_BTC || '0.05');
const RESERVE_SWEEP_MIN_SATS  = 20000; // 0.0002 BTC — don't bother sweeping tiny surplus
const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a'; // same id used across hdWalletRoutes.js / server.js

class SweepService {
  constructor() {
    this.isRunning        = false;
    this.intervalId       = null;
    this._inProgress      = new Set(); // prevents double-sweep of same address
    this._cycleInProgress = false;     // prevents a second full _runCycle() overlapping an unfinished one
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
    // Guard against overlapping cycles: with enough addresses a scan can take
    // longer than SWEEP_INTERVAL_MS, and without this guard the next setInterval
    // tick would start a second full pass on top of the still-running one —
    // doubling the request rate against blockstream.info/mempool.space and
    // making any in-flight rate-limiting worse. Same guard depositMonitor.js
    // already uses for its own poll cycle. This is distinct from _inProgress
    // (which only stops the same single address being swept twice at once).
    if (this._cycleInProgress) {
      console.warn('[SweepService] ⚠️  Previous cycle still running — skipping this tick to avoid doubling request rate');
      return;
    }
    this._cycleInProgress = true;
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

      // Batch of 3 / 1.2s gap — same pacing depositMonitor.js already uses
      // against the same providers (blockstream.info/mempool.space). The old
      // serial "1 address every 2.5s" loop took ~74 minutes to get through
      // ~1,776 addresses — longer than SWEEP_INTERVAL_MS itself, guaranteeing
      // every cycle overlapped the next. This cuts a full pass to ~12 minutes.
      const SWEEP_BATCH = 3;
      for (let i = 0; i < toSweep.length; i += SWEEP_BATCH) {
        const batch = toSweep.slice(i, i + SWEEP_BATCH);
        const results = await Promise.allSettled(
          batch.map(entry => this._sweepOne(entry.userId, entry.address, hotAddress, entry.lastOnchainBtc))
        );
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled') {
            if (r.value > 0) { sweptCount++; totalSwept += r.value; }
          } else {
            // One address failing NEVER stops the rest — silent
            console.error(`[SweepService] ⚠️  Could not sweep ${batch[idx].address.slice(0, 20)}…:`, r.reason?.message || r.reason);
          }
        });
        if (i + SWEEP_BATCH < toSweep.length) await this._sleep(1200);
      }

      if (sweptCount > 0) {
        console.log(`[SweepService] ✅ Done — swept ${sweptCount} address(es), ₿${totalSwept.toFixed(8)} moved to hot wallet`);
      } else {
        console.log(`[SweepService] ✅ Cycle complete — no addresses needed sweeping`);
      }

      // Run after user deposits have landed in the hot wallet, so this cycle's
      // ceiling check sees the up-to-date balance rather than lagging a cycle behind.
      await this._sweepHotSurplusToReserve(hotAddress);

    } catch (err) {
      // Outer guard — the entire cycle should NEVER crash the server
      console.error('[SweepService] Cycle error (non-fatal):', err.message);
    } finally {
      this._cycleInProgress = false;
    }
  }

  // ── Sweep hot wallet surplus above HOT_WALLET_CEILING_BTC into the reserve ──
  // One-way by construction: this only ever calls hdWallet.sweepHotToReserve(),
  // which can only spend hot-wallet UTXOs. It cannot touch the reserve wallet.
  async _sweepHotSurplusToReserve(hotAddress) {
    try {
      const hotBal = await hdWallet.checkBalance(hotAddress);
      if (hotBal.error) {
        console.warn('[SweepService] Reserve check skipped — could not read hot wallet balance:', hotBal.error);
        return;
      }

      const surplusBtc = parseFloat((hotBal.confirmed_btc - HOT_WALLET_CEILING_BTC).toFixed(8));
      const surplusSats = Math.round(surplusBtc * 1e8);
      if (surplusSats < RESERVE_SWEEP_MIN_SATS) return; // under ceiling or surplus too small to bother

      const reserveAddress = hdWallet.getReserveWalletAddress();
      console.log(`[SweepService] Hot wallet ₿${hotBal.confirmed_btc} exceeds ceiling ₿${HOT_WALLET_CEILING_BTC} — sweeping ₿${surplusBtc} to reserve ${reserveAddress}`);

      const result = await hdWallet.sweepHotToReserve(surplusBtc, FEE_RATE_SATS);

      console.log(`[SweepService] ✅ Reserve sweep — ₿${surplusBtc} → ${reserveAddress} | TX: ${result.txid}`);

      await supabaseAdmin.from('wallet_transactions').insert({
        user_id:             COMPANY_WALLET_ID,
        type:                'RESERVE_SWEEP',
        amount_btc:          surplusBtc,
        status:              'CONFIRMED',
        tx_hash:             result.txid,
        destination_address: reserveAddress,
        notes:               `Auto-sweep — hot wallet surplus above ₿${HOT_WALLET_CEILING_BTC} ceiling → reserve — tx: ${result.txid}`,
        created_at:          new Date().toISOString(),
      }).then(null, logErr => {
        console.warn('[SweepService] Reserve sweep audit log failed (funds safe):', logErr.message);
      });

    } catch (err) {
      // Never let a reserve-sweep failure affect the rest of the cycle — funds
      // just stay in the hot wallet and the next cycle retries.
      console.error('[SweepService] Reserve sweep error (non-fatal):', err.message);
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
      // Step 1 — Get UTXOs at this address. throwOnError so a provider failure
      // (rate limit, timeout) is distinguishable from a genuinely empty address.
      // getUTXOs() silently swallows failures into [] by default, which made a
      // stuck check (all blockchain APIs 429ing) look identical in every log to
      // "nothing to sweep here" — no way to tell the two apart. Mirrors the same
      // transient-error detection depositMonitor.js's checkUserDeposit() already
      // uses. Sweeping already retries this address next cycle regardless, so
      // this doesn't change behavior — it just makes a stuck check visible
      // instead of indistinguishable from an empty address.
      let utxos;
      try {
        utxos = await hdWallet.getUTXOs(fromAddress, { throwOnError: true });
      } catch (utxoErr) {
        const status = utxoErr.response?.status;
        const isTransient = status === 429 || status === 503
          || ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(utxoErr.code)
          || /unreachable|timed out|timeout/i.test(utxoErr.message || '');
        if (isTransient) {
          console.warn(`[SweepService] ${fromAddress.slice(0, 20)}… UTXO check failed (${status ? `HTTP ${status}` : (utxoErr.code || 'unreachable')}) — NOT swept this cycle, will retry next cycle. This is a provider outage, not an empty address.`);
        } else {
          console.error(`[SweepService] ${fromAddress.slice(0, 20)}… UTXO check error:`, utxoErr.message);
        }
        return 0;
      }
      if (!utxos || utxos.length === 0) return 0;

      // Step 1b — Never sweep an address while ANY UTXO on it is not yet credited.
      // sendBitcoin() below always drains every UTXO at the address in one
      // transaction (see hdWalletService.js _sendBitcoinLocked — it has no concept
      // of "only these inputs"), so partially sweeping just the credited UTXOs isn't
      // possible without changing the shared send path. Blocking the whole address
      // until every UTXO on it is credited is what actually prevents an uncredited
      // deposit from leaving early. Checked per-UTXO by its own txid against
      // deposit_tracking_v2.credited — NOT by comparing the address's on-chain
      // balance to the user's all-time credited total, which is what the old guard
      // did and which passes almost always once a user has any deposit history
      // (that gap is exactly what let ukbuyer2022's 2026-09-04 deposit sit swept-
      // eligible before it was credited).
      const totalSatsOnChain = utxos.reduce((sum, u) => sum + u.value, 0);
      const onChainBtc       = parseFloat((totalSatsOnChain / 1e8).toFixed(8));
      const { data: creditedTxs } = await supabaseAdmin
        .from('deposit_tracking_v2')
        .select('tx_hash')
        .eq('address', fromAddress)
        .eq('credited', true);
      const creditedHashes  = new Set((creditedTxs || []).map(t => t.tx_hash));
      const uncreditedUtxos = utxos.filter(u => !creditedHashes.has(u.txid));
      if (uncreditedUtxos.length > 0) {
        console.log(`[SweepService] ${fromAddress.slice(0, 20)}… has ${uncreditedUtxos.length} uncredited UTXO(s) (${uncreditedUtxos.map(u => u.txid.slice(0, 12)).join(', ')}) — waiting for DepositMonitor to credit before sweeping this address`);
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

      // Step 4b — Decrement the deposit-detection checkpoint by the full amount that
      // just left this address (onChainBtc — the whole swept UTXO value, fee included,
      // not just sendBtc net of fee). last_onchain_btc is NOT a balance (the class
      // comment above about "never touches user DB balance" is about wallets/
      // user_balances/balance_btc) — it's DepositMonitor's bookkeeping for "on-chain
      // balance already accounted for," and its own code treats it as monotonically
      // increasing only. Once this sweep empties the address, the next deposit here
      // gets compared against a checkpoint that's still sitting at the pre-sweep
      // high-water mark — DepositMonitor then either under-credits it (delta math
      // comes out short by exactly what was swept) or silently drops it entirely if
      // the new deposit doesn't exceed that stale value. Same bug class already fixed
      // for USDT in tronHotWallet.js.
      await this._decrementOnchainCheckpoint(userId, onChainBtc);

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
      running:             this.isRunning,
      cycle_in_progress:    this._cycleInProgress,
      interval_minutes:    SWEEP_INTERVAL_MS / 60000,
      min_sweep_btc:        SWEEP_MIN_SATS / 1e8,
      in_progress:          this._inProgress.size,
      hot_wallet:           hdWallet.getHotWalletAddress(),
      hot_wallet_ceiling_btc: HOT_WALLET_CEILING_BTC,
      reserve_wallet:       hdWallet.getReserveWalletAddress(),
    };
  }

  /** Pulls last_onchain_btc down by whatever just left the address, so the next
   *  deposit there is compared against reality instead of a pre-sweep high-water
   *  mark. Only touches this one checkpoint column — never balance_btc. */
  async _decrementOnchainCheckpoint(userId, sweptAmount) {
    const { data: uw, error } = await supabaseAdmin
      .from('user_wallets').select('last_onchain_btc').eq('user_id', userId).maybeSingle();
    if (error || !uw) {
      console.warn(`[SweepService] Could not read last_onchain_btc to decrement for user ${userId.slice(0,8)}:`, error?.message || 'no row');
      return;
    }
    const newCheckpoint = Math.max(0, parseFloat((parseFloat(uw.last_onchain_btc || 0) - sweptAmount).toFixed(8)));
    const { error: updErr } = await supabaseAdmin
      .from('user_wallets')
      .update({ last_onchain_btc: newCheckpoint, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (updErr) console.warn(`[SweepService] Failed to decrement last_onchain_btc for ${userId.slice(0,8)}:`, updErr.message);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new SweepService();
