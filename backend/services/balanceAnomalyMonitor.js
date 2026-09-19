// services/balanceAnomalyMonitor.js
// PRAQEN — Real-Time Balance Spike & Anomaly Detection System
//
// Monitors deposits, transfers, and wallet adjustments in real-time to detect:
//   1. Single Transaction Spikes: Large deposits exceeding safety thresholds (e.g. >= 0.5 BTC or >= $5,000 USDT).
//   2. Hourly Velocity Breaches: Rapid cumulative increases in a rolling 1-hour window (e.g. >= 1.0 BTC or >= $10,000 USDT).
//   3. High-Frequency Bursts: Multiple deposit credits (> 5 in 10 minutes) for a single user.
//   4. Periodic Balance vs Ledger Drift: Detects "phantom" balance increases not backed by valid transactions.
//
// On detection:
//   - Dispatches instant alerts via Email (emailService) and Telegram (telegramService).
//   - Logs anomaly to memory and DB for visibility on the Admin Panel (/admin).

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const emailService     = require('./emailService');
const { sendTelegramAlert } = require('./telegramService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// A plain .select() with no .range() silently caps at Supabase/PostgREST's
// default row limit (1000) — confirmed 2026-09-19 to be truncating both the
// wallets query (1794 real rows) and the wallet_transactions query (5155+
// real rows) in runPeriodicDriftCheck() below, with no guaranteed row order,
// which made the drift check flag real users (e.g. peace001, a single
// legitimate $249 deposit) as "unaccounted surplus" simply because their
// data fell outside whichever 1000 rows Postgres happened to return.
async function pageAll(table, columns, filter) {
  let out = [], from = 0;
  for (;;) {
    let q = supabaseAdmin.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) { console.error(`[BalanceAnomalyMonitor] pageAll(${table}) error:`, error.message); break; }
    out = out.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

// ── Configurable Thresholds ──────────────────────────────────────────────────
const SPIKE_SINGLE_BTC    = parseFloat(process.env.ANOMALY_SPIKE_BTC  || '0.5');
const SPIKE_SINGLE_USDT   = parseFloat(process.env.ANOMALY_SPIKE_USDT || '5000');
const VELOCITY_HOURLY_BTC = parseFloat(process.env.ANOMALY_VELOCITY_BTC  || '1.0');
const VELOCITY_HOURLY_USDT= parseFloat(process.env.ANOMALY_VELOCITY_USDT || '10000');
const MAX_BURST_COUNT     = parseInt(process.env.ANOMALY_BURST_COUNT || '5', 10);
const BURST_WINDOW_MS     = 10 * 60 * 1000; // 10 minutes
const HOURLY_WINDOW_MS    = 60 * 60 * 1000; // 60 minutes
const OPS_ALERT_EMAIL     = process.env.OPS_ALERT_EMAIL || 'support@praqen.com';

// Periodic drift check runs every 10 min but a genuine unresolved drift
// doesn't need a fresh admin alert every cycle — re-alert at most this often
// per user while the same drift persists.
const DRIFT_ALERT_COOLDOWN_MS = parseInt(process.env.ANOMALY_DRIFT_COOLDOWN_MS || String(24 * 60 * 60 * 1000), 10);

class BalanceAnomalyMonitor {
  constructor() {
    this.userCreditHistory = new Map(); // userId -> [{ timestamp, amount, currency, txHash }]
    this.activeAlerts      = [];        // [{ id, userId, username, severity, title, message, amount, currency, txHash, createdAt, resolved }]
    this.isRunning         = false;
    this.sweepInterval     = null;
    this.lastDriftAlertAt  = new Map(); // userId -> ms timestamp of last drift alert (cooldown gate)
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('\n🛡️  BalanceAnomalyMonitor started — real-time balance spike & security alerting active');
    console.log(`   Thresholds: Single >= ${SPIKE_SINGLE_BTC} BTC / $${SPIKE_SINGLE_USDT} USDT · Hourly >= ${VELOCITY_HOURLY_BTC} BTC / $${VELOCITY_HOURLY_USDT} USDT\n`);

    // Run balance drift check every 10 minutes
    this.sweepInterval = setInterval(() => this.runPeriodicDriftCheck(), 10 * 60 * 1000);
  }

  stop() {
    clearInterval(this.sweepInterval);
    this.isRunning = false;
  }

  // ── Hook: Check each credit event in real-time ──────────────────────────────
  async checkCreditEvent({ userId, username, currency, amount, txHash = '', previousBalance = null, newBalance = null }) {
    const numAmount = parseFloat(amount || 0);
    if (numAmount <= 0) return;

    const now = Date.now();
    const curHistory = this.userCreditHistory.get(userId) || [];
    
    // Purge entries older than 1 hour
    const recent = curHistory.filter(h => now - h.timestamp < HOURLY_WINDOW_MS);
    recent.push({ timestamp: now, amount: numAmount, currency, txHash });
    this.userCreditHistory.set(userId, recent);

    const issues = [];

    // 1. Single Transaction Spike Check
    const singleLimit = currency === 'BTC' ? SPIKE_SINGLE_BTC : SPIKE_SINGLE_USDT;
    if (numAmount >= singleLimit) {
      issues.push({
        severity: 'CRITICAL',
        type: 'SINGLE_CREDIT_SPIKE',
        title: `🚨 Large ${currency} Deposit Spike Detected`,
        message: `User @${username || userId.slice(0, 8)} received a single credit of ${numAmount} ${currency} (Limit: ${singleLimit} ${currency}).`,
      });
    }

    // 2. Rolling 1-Hour Velocity Check
    const currencyRecent = recent.filter(h => h.currency === currency);
    const hourlyTotal = currencyRecent.reduce((sum, h) => sum + h.amount, 0);
    const hourlyLimit = currency === 'BTC' ? VELOCITY_HOURLY_BTC : VELOCITY_HOURLY_USDT;

    if (hourlyTotal >= hourlyLimit && currencyRecent.length > 1) {
      issues.push({
        severity: 'CRITICAL',
        type: 'HOURLY_VELOCITY_BREACH',
        title: `🚨 Rapid ${currency} Velocity Spike Detected`,
        message: `User @${username || userId.slice(0, 8)} accumulated ${hourlyTotal.toFixed(currency === 'BTC' ? 8 : 2)} ${currency} in the last hour across ${currencyRecent.length} deposits (Limit: ${hourlyLimit} ${currency}).`,
      });
    }

    // 3. High-Frequency Burst Check (> 5 deposits in 10 minutes)
    const burstRecent = recent.filter(h => now - h.timestamp < BURST_WINDOW_MS);
    if (burstRecent.length >= MAX_BURST_COUNT) {
      issues.push({
        severity: 'WARNING',
        type: 'HIGH_FREQUENCY_BURST',
        title: `⚠️ High-Frequency Deposit Activity`,
        message: `User @${username || userId.slice(0, 8)} received ${burstRecent.length} deposit credits within 10 minutes.`,
      });
    }

    // If issues found, dispatch alerts and record
    for (const issue of issues) {
      await this.recordAndDispatchAlert({
        userId,
        username,
        severity: issue.severity,
        type: issue.type,
        title: issue.title,
        message: issue.message,
        amount: numAmount,
        currency,
        txHash,
        previousBalance,
        newBalance,
      });
    }
  }

  // ── Dispatch Multi-Channel Alerts (Email + Telegram + Admin Dashboard) ─────
  async recordAndDispatchAlert(alertData) {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullAlert = {
      id: alertId,
      ...alertData,
      createdAt: new Date().toISOString(),
      resolved: false,
    };

    // Store in memory (most recent 100 alerts)
    this.activeAlerts.unshift(fullAlert);
    if (this.activeAlerts.length > 100) this.activeAlerts.pop();

    console.warn(`\n🚨 [ANOMALY ALERT] ${fullAlert.title}`);
    console.warn(`   ${fullAlert.message}`);
    console.warn(`   User: ${fullAlert.username} (${fullAlert.userId}) | TX: ${fullAlert.txHash || 'N/A'}\n`);

    // 1. Email Alert via emailService
    try {
      await emailService.sendEmail({
        to:      OPS_ALERT_EMAIL,
        subject: `🚨 [PRAQEN SECURITY] ${fullAlert.title} — @${fullAlert.username}`,
        type:    'security_anomaly_alert',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #FEF2F2; border-left: 6px solid #DC2626; border-radius: 8px;">
            <h2 style="color: #991B1B; margin-top: 0;">${fullAlert.title}</h2>
            <p><strong>Severity:</strong> <span style="background: #FEE2E2; color: #991B1B; padding: 3px 8px; border-radius: 4px; font-weight: bold;">${fullAlert.severity}</span></p>
            <p><strong>User:</strong> ${fullAlert.username} (ID: <code>${fullAlert.userId}</code>)</p>
            <p><strong>Amount:</strong> ${fullAlert.amount} ${fullAlert.currency}</p>
            ${fullAlert.txHash ? `<p><strong>TX Hash:</strong> <code>${fullAlert.txHash}</code></p>` : ''}
            ${fullAlert.newBalance !== null ? `<p><strong>New Balance:</strong> ${fullAlert.newBalance} ${fullAlert.currency}</p>` : ''}
            <p style="margin-top: 15px; font-size: 14px; color: #374151;">${fullAlert.message}</p>
            <hr style="border: 0; border-top: 1px solid #FCA5A5; margin: 20px 0;" />
            <p style="font-size: 12px; color: #6B7280;">Please inspect the user's account and transaction ledger on the Admin Panel: <a href="https://praqen.com/admin" style="color: #DC2626; font-weight: bold;">Open Admin Dashboard</a></p>
          </div>
        `,
      });
    } catch (e) {
      console.error('[BalanceAnomalyMonitor] Email alert dispatch failed:', e.message);
    }

    // 2. Telegram Alert
    try {
      const telegramMsg = `🚨 *PRAQEN SECURITY ALERT*\n\n*${fullAlert.title}*\n• *User:* @${fullAlert.username || fullAlert.userId.slice(0, 8)}\n• *Amount:* ${fullAlert.amount} ${fullAlert.currency}\n• *Type:* ${fullAlert.type}\n• *TX:* ${fullAlert.txHash ? fullAlert.txHash.slice(0, 16) + '…' : 'None'}\n\nInspect on Admin Panel: https://praqen.com/admin`;
      sendTelegramAlert(fullAlert.userId, telegramMsg).catch(() => {});
    } catch (e) {
      console.error('[BalanceAnomalyMonitor] Telegram alert dispatch failed:', e.message);
    }

    // NOTE: Deliberately does NOT notify the end user — this monitor is
    // admin-only (email + Telegram above). A prior version inserted a
    // "🛡️ Security notice on your account" row into the user's own
    // notifications feed on every alert, which — combined with
    // runPeriodicDriftCheck() having no cooldown — spammed the same users
    // every 10 minutes indefinitely on routine, non-fraudulent drift.
    // Fixed 2026-09-17: removed the user-facing insert, added a cooldown
    // below so drift alerts don't repeat until the condition is re-checked.
  }

  // ── Periodic Drift Check (Compares ledger sum vs wallets) ───────────────────
  async runPeriodicDriftCheck() {
    try {
      // Excludes wallet_role='fee' (the platform's own house fee-collection
      // wallet) — FEE-type transactions mean money ARRIVING for that wallet,
      // the opposite of what they mean for a regular user, so no generic
      // credit/debit mapping can be correct for both at once.
      const wallets = await pageAll('wallets', 'user_id, balance_btc, balance_usdt, wallet_role',
        q => q.neq('wallet_role', 'fee'));
      const allTx = await pageAll('wallet_transactions', 'user_id, type, currency, amount_btc, amount_usdt, status',
        q => q.in('status', ['CONFIRMED', 'COMPLETED']));

      if (!wallets.length || !allTx.length) return;

      const ledgerMap = new Map();
      for (const tx of allTx) {
        const cur = ledgerMap.get(tx.user_id) || { btc: 0, usdt: 0 };
        const btc = parseFloat(tx.amount_btc || 0);
        const usdt = parseFloat(tx.amount_usdt || 0);

        // ESCROW_REFUND (not just REFUND) is this codebase's actual type for a
        // cancelled trade returning funds — omitting it made the ledger sum go
        // deeply negative for any user who'd ever had a trade cancelled.
        if (tx.type === 'DEPOSIT' || tx.type === 'TRANSFER_IN' || tx.type === 'ESCROW_RELEASE' || tx.type === 'REFUND' || tx.type === 'ESCROW_REFUND') {
          cur.btc += btc;
          cur.usdt += usdt;
        } else if (tx.type === 'SWAP') {
          // SWAP rows already store SIGNED amounts (negative = sold, positive
          // = received) — add both directly, no direction parsing needed.
          cur.btc += btc;
          cur.usdt += usdt;
        } else if (tx.type === 'WITHDRAWAL' || tx.type === 'TRANSFER_OUT' || tx.type === 'ESCROW_LOCK' || tx.type === 'FEE') {
          cur.btc -= btc;
          cur.usdt -= usdt;
        }
        ledgerMap.set(tx.user_id, cur);
      }

      for (const w of wallets) {
        const l = ledgerMap.get(w.user_id) || { btc: 0, usdt: 0 };
        const btcDiff = parseFloat(w.balance_btc || 0) - l.btc;
        const usdtDiff = parseFloat(w.balance_usdt || 0) - l.usdt;

        // If wallet balance is significantly higher than ledger records without explanation
        if (btcDiff > 0.005 || usdtDiff > 50) {
          const lastAlert = this.lastDriftAlertAt.get(w.user_id) || 0;
          if (Date.now() - lastAlert < DRIFT_ALERT_COOLDOWN_MS) continue; // already alerted recently — skip, don't spam
          this.lastDriftAlertAt.set(w.user_id, Date.now());

          const { data: u } = await supabaseAdmin.from('users').select('username').eq('id', w.user_id).maybeSingle();
          const username = u?.username || w.user_id.slice(0, 8);

          await this.recordAndDispatchAlert({
            userId: w.user_id,
            username,
            severity: 'WARNING',
            type: 'LEDGER_BALANCE_DRIFT',
            title: `⚠️ Unaccounted Balance Drift Detected`,
            message: `User @${username} has a wallet balance exceeding recorded ledger transactions (Diff: +${btcDiff.toFixed(6)} BTC / +$${usdtDiff.toFixed(2)} USDT).`,
            amount: btcDiff > 0 ? btcDiff : usdtDiff,
            currency: btcDiff > 0 ? 'BTC' : 'USDT',
            txHash: '',
            previousBalance: null,
            newBalance: btcDiff > 0 ? w.balance_btc : w.balance_usdt,
          });
        }
      }
    } catch (err) {
      console.error('[BalanceAnomalyMonitor] Periodic drift check error:', err.message);
    }
  }

  // ── Admin Panel API Accessors ───────────────────────────────────────────────
  getAlerts({ resolved = null } = {}) {
    if (resolved === null) return this.activeAlerts;
    return this.activeAlerts.filter(a => a.resolved === resolved);
  }

  resolveAlert(alertId, adminNotes = '') {
    const alert = this.activeAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      alert.adminNotes = adminNotes;
      return true;
    }
    return false;
  }

  getStatus() {
    return {
      running: this.isRunning,
      activeAlertsCount: this.activeAlerts.filter(a => !a.resolved).length,
      totalAlertsTracked: this.activeAlerts.length,
      monitoredUsersCount: this.userCreditHistory.size,
      thresholds: {
        spikeBtc: SPIKE_SINGLE_BTC,
        spikeUsdt: SPIKE_SINGLE_USDT,
        velocityHourlyBtc: VELOCITY_HOURLY_BTC,
        velocityHourlyUsdt: VELOCITY_HOURLY_USDT,
        burstCount: MAX_BURST_COUNT,
      },
    };
  }
}

module.exports = new BalanceAnomalyMonitor();
