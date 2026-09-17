// services/walletProvisioningReconciler.js
// ─────────────────────────────────────────────────────────────────────────────
// PART 2 / step 2.4 — make sure every user actually has a deposit address.
//
// Address provisioning at signup is fire-and-forget with swallowed errors
// (server.js Promise.resolve().then(...) around hdWalletService.ensureWalletExists).
// If it throws, the user silently ends up with no user_wallets.btc_address /
// tron_address and NOTHING watches their deposits. ~14 users currently have no
// tron_address.
//
// This runs on startup and every RUN_EVERY_HOURS, finds any user missing a
// BTC or Tron deposit address, and calls the SAME idempotent
// hdWalletService.ensureWalletExists() the signup path uses to fill the gap.
// It never moves funds and never credits anything.
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWalletService = require('./hdWalletService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const RUN_EVERY_MS = Math.max(1, parseFloat(process.env.WALLET_PROVISION_RECONCILE_HOURS || '6')) * 3600 * 1000;
const PACE_MS      = 400;

class WalletProvisioningReconciler {
  constructor() {
    this.isRunning  = false;
    this.intervalId = null;
    this.lastRunAt  = null;
    this.lastResult = null;
  }

  start() {
    if (this.isRunning) { console.log('[WalletProvision] Already running — skipping duplicate start'); return; }
    this.isRunning = true;
    console.log(`\n🏗  WalletProvisioningReconciler started — every ${RUN_EVERY_MS / 3600000}h`);
    this.runOnce();
    this.intervalId = setInterval(() => this.runOnce(), RUN_EVERY_MS);
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning  = false;
  }

  async runOnce() {
    try {
      // users with a wallets row (i.e. real, provisioned accounts) but an
      // incomplete user_wallets deposit-address record
      const { data: wals, error: wErr } = await supabaseAdmin
        .from('wallets').select('user_id').limit(20000);
      if (wErr) { console.error('[WalletProvision] wallets fetch failed:', wErr.message); return; }

      const { data: uws } = await supabaseAdmin
        .from('user_wallets').select('user_id, btc_address, tron_address').limit(20000);
      const uwMap = new Map();
      for (const u of (uws || [])) uwMap.set(u.user_id, u);

      const missing = [];
      for (const w of (wals || [])) {
        const uw = uwMap.get(w.user_id);
        const noBtc  = !uw || !uw.btc_address  || uw.btc_address  === '';
        const noTron = !uw || !uw.tron_address || uw.tron_address === '';
        if (noBtc || noTron) missing.push({ userId: w.user_id, noBtc, noTron });
      }

      if (!missing.length) {
        this.lastRunAt = new Date().toISOString();
        this.lastResult = 'all users have BTC + Tron deposit addresses';
        console.log('[WalletProvision] ✅ every provisioned user has both deposit addresses');
        return;
      }

      console.warn(`[WalletProvision] ${missing.length} user(s) missing a deposit address — provisioning…`);
      let ok = 0, fail = 0;
      for (const m of missing) {
        try {
          const res = await hdWalletService.ensureWalletExists(m.userId);
          // best-effort: subscribe the (possibly new) BTC address to realtime
          try {
            if (res?.address) require('./realtimeDepositService').subscribeAddress(m.userId, res.address);
          } catch (_) {}
          ok++;
          console.log(`[WalletProvision]   ✓ ${m.userId.slice(0, 8)} (${m.noBtc ? 'BTC ' : ''}${m.noTron ? 'Tron' : ''})`);
        } catch (e) {
          fail++;
          console.error(`[WalletProvision]   ✗ ${m.userId.slice(0, 8)}: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, PACE_MS));
      }

      this.lastRunAt = new Date().toISOString();
      this.lastResult = `provisioned ${ok}, failed ${fail}`;
      console.log(`[WalletProvision] done — ${ok} provisioned, ${fail} failed`);
    } catch (err) {
      console.error('[WalletProvision] runOnce error:', err.message);
    }
  }

  getStatus() {
    return { running: this.isRunning, run_every_h: RUN_EVERY_MS / 3600000, last_run_at: this.lastRunAt, last_result: this.lastResult };
  }
}

module.exports = new WalletProvisioningReconciler();
