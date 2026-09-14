// services/depositHealthMonitor.js
// ─────────────────────────────────────────────────────────────────────────────
// PART 2 / step 2.5 — deposit-pipeline heartbeat.
//
// WHY: on 2026-09-02 BTC deposit crediting and the reconciliation job both
// stopped and nobody knew for ~30 hours — it was found only when users
// complained. This service watches the pipeline from the outside and emails ops
// (via emailService — Resend → Brevo, the transport that actually works) the
// moment something looks wrong.
//
// 100% READ-ONLY. It runs SELECTs and reads other services' getStatus(). It
// never writes a row, never calls an RPC, never moves a satoshi or a cent.
//
// Tunables (all optional, read once at startup):
//   DEPOSIT_HEALTH_CHECK_MIN            how often to check         (default 15)
//   DEPOSIT_HEALTH_BTC_STALL_H          alert if no BTC credit in  (default 3)
//   DEPOSIT_HEALTH_USDT_STALL_H         alert if no USDT credit in (default 3)
//   DEPOSIT_HEALTH_RECON_STALL_H        alert if no recon cycle in (default 3)
//   DEPOSIT_HEALTH_STUCK_CREDIT_MIN     alert on credited=false >  (default 20)
//   DEPOSIT_HEALTH_ALERT_COOLDOWN_MIN   don't repeat same alert in (default 60)
//   OPS_ALERT_EMAIL                     where alerts go            (default support@praqen.com)
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const emailService = require('./emailService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : d; };

const CHECK_INTERVAL_MS  = num(process.env.DEPOSIT_HEALTH_CHECK_MIN, 15) * 60 * 1000;
const BTC_STALL_H        = num(process.env.DEPOSIT_HEALTH_BTC_STALL_H, 3);
const USDT_STALL_H       = num(process.env.DEPOSIT_HEALTH_USDT_STALL_H, 3);
const RECON_STALL_H      = num(process.env.DEPOSIT_HEALTH_RECON_STALL_H, 3);
const STUCK_CREDIT_MIN   = num(process.env.DEPOSIT_HEALTH_STUCK_CREDIT_MIN, 20);
const PENDING_SWEEP_MIN  = num(process.env.DEPOSIT_HEALTH_PENDING_SWEEP_MIN, 60);   // 2.6
const ALERT_COOLDOWN_MS  = num(process.env.DEPOSIT_HEALTH_ALERT_COOLDOWN_MIN, 60) * 60 * 1000;
const OPS_EMAIL          = process.env.OPS_ALERT_EMAIL || 'support@praqen.com';

// 2.7 — hot-wallet / treasury thresholds
const HOT_MIN_TRX        = num(process.env.HOT_WALLET_MIN_TRX, 200);
const HOT_LIABILITY_RATIO = num(process.env.HOT_WALLET_LIABILITY_RATIO, 0.9); // alert if hot wallet holds < ratio × user liability
const HOT_CHECK_EVERY    = Math.max(1, parseInt(process.env.DEPOSIT_HEALTH_HOT_CHECK_EVERY || '4', 10)); // every Nth health check
const DIGEST_HOUR_UTC    = Math.min(23, Math.max(0, parseInt(process.env.DEPOSIT_HEALTH_DIGEST_HOUR || '8', 10)));
const tronConfig         = require('./tronConfig');
const USDT_CONTRACT      = tronConfig.usdtContract;

class DepositHealthMonitor {
  constructor() {
    this.isRunning     = false;
    this.intervalId    = null;
    this._checkInFlight = false;
    this._lastAlertAt  = {}; // alert-signature -> epoch ms (cooldown de-dupe)
    this.lastCheckAt   = null;
    this.lastResult    = null;
    this._checkCount   = 0;
    this._lastDigestDay = null; // yyyy-mm-dd of the last digest sent
  }

  start() {
    if (this.isRunning) { console.log('[DepositHealth] Already running — skipping duplicate start'); return; }
    this.isRunning = true;
    console.log(`\n🩺 DepositHealthMonitor started — checks every ${CHECK_INTERVAL_MS / 60000} min (read-only)`);
    console.log(`   thresholds: BTC ${BTC_STALL_H}h · USDT ${USDT_STALL_H}h · recon ${RECON_STALL_H}h · stuck-credit ${STUCK_CREDIT_MIN}min`);
    this.runCheck();
    this.intervalId = setInterval(() => this.runCheck(), CHECK_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning  = false;
    console.log('[DepositHealth] Stopped');
  }

  async runCheck() {
    if (this._checkInFlight) return;
    this._checkInFlight = true;
    const problems = [];
    try {
      // 1. BTC deposit stall
      const btcAgo = await this._hoursSinceNewest('wallet_transactions', 'created_at',
        q => q.eq('type', 'DEPOSIT').eq('currency', 'BTC'));
      if (btcAgo !== null && btcAgo > BTC_STALL_H) {
        problems.push(`No BTC deposit credited in ${btcAgo.toFixed(1)}h (threshold ${BTC_STALL_H}h) — BTC detection may be down.`);
      }

      // 2. USDT deposit stall
      const usdtAgo = await this._hoursSinceNewest('wallet_transactions', 'created_at',
        q => q.eq('type', 'DEPOSIT').eq('currency', 'USDT'));
      if (usdtAgo !== null && usdtAgo > USDT_STALL_H) {
        problems.push(`No USDT deposit credited in ${usdtAgo.toFixed(1)}h (threshold ${USDT_STALL_H}h) — USDT detection may be behind.`);
      }

      // 3. reconciliation cycle stall — prefer the service's own marker, fall
      //    back to "newest reconciliation_flags row" as a rough proxy.
      let reconAgo = null;
      try {
        const st = require('./depositReconciliationService').getStatus?.();
        if (st?.lastCycleCompletedAt) reconAgo = (Date.now() - Date.parse(st.lastCycleCompletedAt)) / 3600e3;
      } catch (_) { /* not loaded */ }
      if (reconAgo === null) {
        reconAgo = await this._hoursSinceNewest('reconciliation_flags', 'created_at', q => q);
      }
      if (reconAgo !== null && reconAgo > RECON_STALL_H) {
        problems.push(`Reconciliation has not completed a cycle in ${reconAgo.toFixed(1)}h (threshold ${RECON_STALL_H}h).`);
      }

      // 4. credits stuck mid-flight
      const stuckCutoff = new Date(Date.now() - STUCK_CREDIT_MIN * 60 * 1000).toISOString();
      const { data: stuck } = await supabaseAdmin
        .from('deposit_tracking_v2')
        .select('tx_hash, currency, amount, user_id, created_at')
        .eq('credited', false).lt('created_at', stuckCutoff).limit(20);
      if (stuck && stuck.length) {
        problems.push(`${stuck.length} deposit_tracking_v2 row(s) stuck credited=false for > ${STUCK_CREDIT_MIN}min: `
          + stuck.map(r => `${r.currency} ${r.amount} tx ${String(r.tx_hash).slice(0, 12)}… (user ${String(r.user_id).slice(0, 8)})`).join('; '));
      }

      // 5. STALE sweeps since roughly the last check (fingerprint of a re-credit)
      const swCutoff = new Date(Date.now() - CHECK_INTERVAL_MS * 2).toISOString();
      const { data: staleSweeps } = await supabaseAdmin
        .from('hot_wallet_sweeps')
        .select('user_id, amount_usdt, error, created_at')
        .eq('status', 'STALE').gt('created_at', swCutoff).limit(20);
      if (staleSweeps && staleSweeps.length) {
        problems.push(`${staleSweeps.length} sweep(s) went STALE since the last check (possible historic-deposit re-processing): `
          + staleSweeps.map(r => `$${r.amount_usdt} user ${String(r.user_id).slice(0, 8)} — ${r.error}`).join('; '));
      }

      // 6. realtime WebSocket connectivity
      try {
        const rt = require('./realtimeDepositService').getStatus?.();
        if (rt && rt.connected === false) problems.push('Realtime deposit WebSocket is DISCONNECTED.');
      } catch (_) { /* not loaded */ }

      // 7 (2.6). sweeps stuck in PENDING too long
      const pendCutoff = new Date(Date.now() - PENDING_SWEEP_MIN * 60 * 1000).toISOString();
      const { data: pendSweeps } = await supabaseAdmin
        .from('hot_wallet_sweeps')
        .select('user_id, amount_usdt, error, created_at')
        .eq('status', 'PENDING').lt('created_at', pendCutoff).limit(20);
      if (pendSweeps && pendSweeps.length) {
        problems.push(`${pendSweeps.length} sweep(s) stuck PENDING for > ${PENDING_SWEEP_MIN}min — hot wallet not receiving these deposits: `
          + pendSweeps.map(r => `$${r.amount_usdt} user ${String(r.user_id).slice(0, 8)} — ${(r.error || 'no error text').slice(0, 60)}`).join('; '));
      }

      // 8 (2.7). hot-wallet gas + liability — heavier (external calls), so only
      // every HOT_CHECK_EVERY-th health check.
      this._checkCount++;
      if (this._checkCount % HOT_CHECK_EVERY === 1) {
        try {
          const hw = await this._checkHotWallets();
          problems.push(...hw);
        } catch (e) {
          console.warn('[DepositHealth] hot-wallet check skipped:', e.message);
        }
      }

      this.lastCheckAt = new Date().toISOString();
      this.lastResult  = problems.length ? problems : ['ok'];

      // 9 (2.7). once-a-day digest
      await this._maybeDailyDigest();

      if (problems.length === 0) {
        console.log(`[DepositHealth] ✅ all checks passed ${this.lastCheckAt}`);
        return;
      }
      console.warn(`[DepositHealth] ⚠️  ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
      await this._alert(problems);
    } catch (err) {
      console.error('[DepositHealth] check error:', err.message);
    } finally {
      this._checkInFlight = false;
    }
  }

  async _alert(problems) {
    // Cool-down keyed on the set of problem messages, so the same ongoing
    // incident does not email every CHECK_INTERVAL.
    const sig = problems.join(' | ').slice(0, 400);
    const last = this._lastAlertAt[sig] || 0;
    if (Date.now() - last < ALERT_COOLDOWN_MS) return;
    this._lastAlertAt[sig] = Date.now();

    try {
      await emailService.sendEmail({
        to:      OPS_EMAIL,
        subject: `⚠️ PRAQEN deposit pipeline — ${problems.length} health problem(s)`,
        type:    'deposit_health_alert',
        html: `<p><strong>The deposit-pipeline health check found ${problems.length} problem(s)</strong> at ${new Date().toISOString()}:</p>`
             + `<ul>${problems.map(p => `<li>${p}</li>`).join('')}</ul>`
             + `<p style="color:#6B7280;font-size:12px">Automated — services/depositHealthMonitor.js. `
             + `Adjust thresholds with the DEPOSIT_HEALTH_* env vars.</p>`,
      });
      console.log('[DepositHealth] 📧 alert email sent to', OPS_EMAIL);
    } catch (e) {
      console.error('[DepositHealth] alert email failed:', e.message);
    }
  }

  async _hoursSinceNewest(table, col, filterFn) {
    try {
      let q = supabaseAdmin.from(table).select(col).order(col, { ascending: false }).limit(1);
      q = filterFn(q);
      const { data, error } = await q;
      if (error || !data || !data.length || !data[0][col]) return null;
      return (Date.now() - Date.parse(data[0][col])) / 3600e3;
    } catch (_) {
      return null;
    }
  }

  // ── 2.7 — hot-wallet gas + liability coverage ────────────────────────────
  async _checkHotWallets() {
    const out = [];

    // sum user liabilities from the authoritative table
    const { data: liab } = await supabaseAdmin.from('wallets').select('balance_btc, balance_usdt').limit(20000);
    const owedBtc  = (liab || []).reduce((s, r) => s + Number(r.balance_btc || 0), 0);
    const owedUsdt = (liab || []).reduce((s, r) => s + Number(r.balance_usdt || 0), 0);

    // ── Tron hot wallet ──
    let tronAddr = process.env.TRON_HOT_WALLET_ADDRESS || null;
    if (!tronAddr) { try { tronAddr = require('./tronHotWallet').getHotWalletAddress?.(); } catch (_) {} }
    if (tronAddr) {
      try {
        const { data } = await axios.get(`${tronConfig.trongridUrl}/v1/accounts/${tronAddr}`, {
          headers: tronConfig.getHeaders(),
          timeout: 15000,
        });
        const acc = (data?.data || [])[0] || {};
        const trx = Number(acc.balance || 0) / 1e6;
        const usdt = (acc.trc20 || []).map(o => o[USDT_CONTRACT]).filter(Boolean).map(v => Number(v) / 1e6)[0] || 0;
        if (trx < HOT_MIN_TRX) out.push(`Tron hot wallet ${tronAddr.slice(0, 10)}… has ${trx.toFixed(1)} TRX (reserve ${HOT_MIN_TRX}) — USDT withdrawals/sweeps will fail.`);
        if (owedUsdt > 0 && usdt < owedUsdt * HOT_LIABILITY_RATIO) out.push(`Tron hot wallet holds $${usdt.toFixed(2)} USDT vs $${owedUsdt.toFixed(2)} owed to users (< ${Math.round(HOT_LIABILITY_RATIO * 100)}%).`);
      } catch (e) { console.warn('[DepositHealth] Tron hot-wallet read failed:', e.message); }
    }

    // ── BTC hot wallet ──
    let btcAddr = null;
    try { btcAddr = require('./hdWalletService').getHotWalletAddress?.(); } catch (_) {}
    if (btcAddr) {
      try {
        const gw = require('./btcApiGateway');
        const d = await gw.get(`/address/${btcAddr}`, { priority: 'low' });
        const cs = d?.chain_stats || {};
        const btc = ((cs.funded_txo_sum || 0) - (cs.spent_txo_sum || 0)) / 1e8;
        if (owedBtc > 0 && btc < owedBtc * HOT_LIABILITY_RATIO) out.push(`BTC hot wallet holds ₿${btc.toFixed(8)} vs ₿${owedBtc.toFixed(8)} owed to users (< ${Math.round(HOT_LIABILITY_RATIO * 100)}%).`);
      } catch (e) { console.warn('[DepositHealth] BTC hot-wallet read failed:', e.message); }
    }

    return out;
  }

  // ── 2.7 — once-a-day digest of the deposit pipeline ──────────────────────
  async _maybeDailyDigest() {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (this._lastDigestDay === day) return;
    if (now.getUTCHours() < DIGEST_HOUR_UTC) return; // wait until the target hour
    this._lastDigestDay = day;

    try {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const q = (t) => supabaseAdmin.from(t);
      const [dep, sweeps, flags, stuck, staleSw] = await Promise.all([
        q('wallet_transactions').select('currency, amount_btc, amount_usdt').eq('type', 'DEPOSIT').gte('created_at', since),
        q('hot_wallet_sweeps').select('status').gte('created_at', since),
        q('reconciliation_flags').select('reason').eq('status', 'RECONCILIATION_REQUIRED'),
        q('deposit_tracking_v2').select('id').eq('credited', false),
        q('hot_wallet_sweeps').select('id').eq('status', 'STALE').gte('created_at', since),
      ]);
      const dRows = dep.data || [];
      const btcIn = dRows.filter(r => r.currency === 'BTC').reduce((s, r) => s + Number(r.amount_btc || 0), 0);
      const usdtIn = dRows.filter(r => r.currency === 'USDT').reduce((s, r) => s + Number(r.amount_usdt || 0), 0);
      const swBy = {};
      for (const r of (sweeps.data || [])) swBy[r.status] = (swBy[r.status] || 0) + 1;
      const flagBy = {};
      for (const r of (flags.data || [])) flagBy[r.reason] = (flagBy[r.reason] || 0) + 1;

      await emailService.sendEmail({
        to: OPS_EMAIL,
        subject: `📊 PRAQEN deposit pipeline — daily digest ${day}`,
        type: 'deposit_health_digest',
        html:
          `<p><strong>Last 24 h</strong></p>`
          + `<ul>`
          + `<li>Deposits credited: ${dRows.length} — ₿${btcIn.toFixed(8)} + $${usdtIn.toFixed(2)} USDT</li>`
          + `<li>Sweeps: ${Object.entries(swBy).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}</li>`
          + `<li>STALE sweeps (24 h): ${(staleSw.data || []).length}</li>`
          + `<li>Credits stuck (credited=false, all-time): ${(stuck.data || []).length}</li>`
          + `<li>Open reconciliation flags: ${Object.entries(flagBy).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}</li>`
          + `</ul>`
          + `<p style="color:#6B7280;font-size:12px">Automated — services/depositHealthMonitor.js</p>`,
      });
      console.log('[DepositHealth] 📊 daily digest sent');
    } catch (e) {
      console.error('[DepositHealth] daily digest failed:', e.message);
    }
  }

  getStatus() {
    return {
      running:            this.isRunning,
      check_interval_min: CHECK_INTERVAL_MS / 60000,
      last_check_at:      this.lastCheckAt,
      last_result:        this.lastResult,
    };
  }
}

module.exports = new DepositHealthMonitor();
