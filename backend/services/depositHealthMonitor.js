// services/depositHealthMonitor.js
// ─────────────────────────────────────────────────────────────────────────────
// PART 2 / step 2.5 — deposit-pipeline heartbeat.
//
// SCOPE (narrowed 2026-09-18 per request): this alerts ONLY on one condition —
// a user's deposit (BTC or USDT) was credited but failed to reach the hot
// wallet. It deliberately does NOT alert on deposit-detection stalls,
// reconciliation stalls, websocket disconnects, or hot-wallet treasury
// levels — those were removed as noise unrelated to "did this specific
// deposit actually sweep."
//
// 100% READ-ONLY. It runs SELECTs only. It never writes a row, never calls
// an RPC, never moves a satoshi or a cent.
//
// Tunables (all optional, read once at startup):
//   DEPOSIT_HEALTH_CHECK_MIN            how often to check          (default 15)
//   DEPOSIT_HEALTH_PENDING_SWEEP_MIN    alert if not swept within   (default 60)
//   DEPOSIT_HEALTH_ALERT_COOLDOWN_MIN   don't repeat same alert in  (default 60)
//   OPS_ALERT_EMAIL                     where alerts go             (default support@praqen.com)
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const emailService = require('./emailService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : d; };

const CHECK_INTERVAL_MS  = num(process.env.DEPOSIT_HEALTH_CHECK_MIN, 15) * 60 * 1000;
const PENDING_SWEEP_MIN  = num(process.env.DEPOSIT_HEALTH_PENDING_SWEEP_MIN, 60);
const LOOKBACK_MS        = 24 * 3600 * 1000; // don't rescan history older than this every cycle
const ALERT_COOLDOWN_MS  = num(process.env.DEPOSIT_HEALTH_ALERT_COOLDOWN_MIN, 60) * 60 * 1000;
const OPS_EMAIL          = process.env.OPS_ALERT_EMAIL || 'support@praqen.com';
const DIGEST_HOUR_UTC    = Math.min(23, Math.max(0, parseInt(process.env.DEPOSIT_HEALTH_DIGEST_HOUR || '8', 10)));

class DepositHealthMonitor {
  constructor() {
    this.isRunning     = false;
    this.intervalId    = null;
    this._checkInFlight = false;
    this._lastAlertAt  = {}; // alert-signature -> epoch ms (cooldown de-dupe)
    this.lastCheckAt   = null;
    this.lastResult    = null;
    this._lastDigestDay = null; // yyyy-mm-dd of the last digest sent
  }

  start() {
    if (this.isRunning) { console.log('[DepositHealth] Already running — skipping duplicate start'); return; }
    this.isRunning = true;
    console.log(`\n🩺 DepositHealthMonitor started — checks every ${CHECK_INTERVAL_MS / 60000} min (read-only)`);
    console.log(`   scope: BTC/USDT deposit credited but failed to sweep — alert threshold ${PENDING_SWEEP_MIN}min`);
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
      // 1. USDT: sweeps that went STALE (a real attempted sweep that failed)
      const swCutoff = new Date(Date.now() - CHECK_INTERVAL_MS * 2).toISOString();
      const { data: staleSweeps } = await supabaseAdmin
        .from('hot_wallet_sweeps')
        .select('user_id, amount_usdt, error, created_at')
        .eq('status', 'STALE').gt('created_at', swCutoff).limit(20);
      if (staleSweeps && staleSweeps.length) {
        problems.push(`${staleSweeps.length} USDT sweep(s) went STALE since the last check — deposit credited but failed to reach the hot wallet: `
          + staleSweeps.map(r => `$${r.amount_usdt} user ${String(r.user_id).slice(0, 8)} — ${r.error}`).join('; '));
      }

      // 2. USDT: sweeps stuck in PENDING too long (queued but never completed)
      const pendCutoff = new Date(Date.now() - PENDING_SWEEP_MIN * 60 * 1000).toISOString();
      const { data: pendSweeps } = await supabaseAdmin
        .from('hot_wallet_sweeps')
        .select('user_id, amount_usdt, error, created_at')
        .eq('status', 'PENDING').lt('created_at', pendCutoff).limit(20);
      if (pendSweeps && pendSweeps.length) {
        problems.push(`${pendSweeps.length} USDT sweep(s) stuck PENDING for > ${PENDING_SWEEP_MIN}min — hot wallet not receiving these deposits: `
          + pendSweeps.map(r => `$${r.amount_usdt} user ${String(r.user_id).slice(0, 8)} — ${(r.error || 'no error text').slice(0, 60)}`).join('; '));
      }

      // 3. BTC: no queue table like USDT's hot_wallet_sweeps exists for BTC —
      // sweepService.sweepUser() writes straight to wallet_transactions. So a
      // failed/missed BTC sweep is found by cross-referencing credited BTC
      // deposits against SWEEP rows instead.
      const btcMissing = await this._checkBtcSweepFailures();
      problems.push(...btcMissing);

      this.lastCheckAt = new Date().toISOString();
      this.lastResult  = problems.length ? problems : ['ok'];

      // 4. once-a-day digest
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
    //
    // In-memory _lastAlertAt alone is NOT restart-safe: if this process
    // crash-loops (was seen firing every 20-40s on 2026-09-18 instead of
    // once per ALERT_COOLDOWN_MS), every restart wipes this object and the
    // cooldown resets to zero, spamming the same alert on every boot. The
    // email_logs table survives restarts (it's in the DB), so that's the
    // source of truth now; the in-memory map is kept only as a fast-path to
    // skip a DB round-trip on very frequent checks within the same process.
    const sig = problems.join(' | ').slice(0, 400);
    const memLast = this._lastAlertAt[sig] || 0;
    if (Date.now() - memLast < ALERT_COOLDOWN_MS) return;

    const dbLast = await this._lastEmailSentAt('deposit_health_alert', sig);
    if (dbLast !== null && Date.now() - dbLast < ALERT_COOLDOWN_MS) {
      this._lastAlertAt[sig] = dbLast; // sync memory so we don't re-query every tick
      return;
    }
    this._lastAlertAt[sig] = Date.now();

    try {
      await emailService.sendEmail({
        to:      OPS_EMAIL,
        subject: `⚠️ PRAQEN deposit pipeline — ${problems.length} health problem(s)`,
        type:    'deposit_health_alert',
        metadata: { signature: sig },
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

  // ── Restart-safe "was this already sent recently" check, backed by
  // email_logs instead of process memory. Optionally matches on the
  // signature stored in metadata (used for alerts, where different problem
  // sets should each get their own cooldown); omit signature to just check
  // "was ANY email of this type sent recently" (used for the daily digest).
  async _lastEmailSentAt(type, signature = null) {
    try {
      const { data } = await supabaseAdmin
        .from('email_logs')
        .select('sent_at, metadata')
        .eq('type', type)
        .eq('status', 'sent')
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(signature ? 20 : 1);
      if (!data || !data.length) return null;
      const row = signature ? data.find(r => r.metadata?.signature === signature) : data[0];
      return row ? Date.parse(row.sent_at) : null;
    } catch (e) {
      console.warn('[DepositHealth] _lastEmailSentAt check failed (failing open — will send):', e.message);
      return null;
    }
  }

  // ── BTC equivalent of the USDT STALE/PENDING sweep checks above. BTC has no
  // queue table to inspect, so this finds credited BTC deposits older than
  // PENDING_SWEEP_MIN with no SWEEP wallet_transactions row after them.
  async _checkBtcSweepFailures() {
    const lookbackCutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const pendCutoff     = new Date(Date.now() - PENDING_SWEEP_MIN * 60 * 1000).toISOString();

    const { data: credited } = await supabaseAdmin
      .from('deposit_tracking_v2')
      .select('user_id, tx_hash, amount, credited_at')
      .eq('currency', 'BTC').eq('credited', true)
      .gte('credited_at', lookbackCutoff).lt('credited_at', pendCutoff)
      .limit(200);
    if (!credited || !credited.length) return [];

    const userIds = [...new Set(credited.map(r => r.user_id))];
    const { data: sweeps } = await supabaseAdmin
      .from('wallet_transactions')
      .select('user_id, created_at')
      .eq('type', 'SWEEP').eq('currency', 'BTC')
      .in('user_id', userIds)
      .gte('created_at', lookbackCutoff);

    const latestSweepAt = {};
    for (const s of (sweeps || [])) {
      const t = Date.parse(s.created_at);
      if (!latestSweepAt[s.user_id] || t > latestSweepAt[s.user_id]) latestSweepAt[s.user_id] = t;
    }

    const missing = credited.filter(r => {
      const swept = latestSweepAt[r.user_id];
      return !swept || swept < Date.parse(r.credited_at);
    });
    if (!missing.length) return [];

    return [`${missing.length} BTC deposit(s) credited but not yet swept to hot wallet (> ${PENDING_SWEEP_MIN}min) — deposit credited but failed to reach the hot wallet: `
      + missing.map(r => `₿${r.amount} tx ${String(r.tx_hash).slice(0, 12)}… (user ${String(r.user_id).slice(0, 8)})`).join('; ')];
  }

  // ── 2.7 — once-a-day digest of the deposit pipeline ──────────────────────
  // Same restart-safety issue as _alert(): _lastDigestDay lives in memory, so
  // a crash-looping process (each boot past DIGEST_HOUR_UTC) re-sends this
  // every restart instead of once a day — seen firing every 20-40s on
  // 2026-09-18. Checked against email_logs (persists across restarts) before
  // actually sending; the in-memory flag is kept only to skip the DB round
  // trip on repeated checks within one process's uptime.
  async _maybeDailyDigest() {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (this._lastDigestDay === day) return;
    if (now.getUTCHours() < DIGEST_HOUR_UTC) return; // wait until the target hour

    const lastSentAt = await this._lastEmailSentAt('deposit_health_digest');
    if (lastSentAt !== null && new Date(lastSentAt).toISOString().slice(0, 10) === day) {
      this._lastDigestDay = day; // already sent today (by this process or an earlier restart) — sync memory
      return;
    }
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
