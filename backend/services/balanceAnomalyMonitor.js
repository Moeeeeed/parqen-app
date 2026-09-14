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

// ── Configurable Thresholds ──────────────────────────────────────────────────
const SPIKE_SINGLE_BTC    = parseFloat(process.env.ANOMALY_SPIKE_BTC  || '0.5');
const SPIKE_SINGLE_USDT   = parseFloat(process.env.ANOMALY_SPIKE_USDT || '5000');
const VELOCITY_HOURLY_BTC = parseFloat(process.env.ANOMALY_VELOCITY_BTC  || '1.0');
const VELOCITY_HOURLY_USDT= parseFloat(process.env.ANOMALY_VELOCITY_USDT || '10000');
const MAX_BURST_COUNT     = parseInt(process.env.ANOMALY_BURST_COUNT || '5', 10);
const BURST_WINDOW_MS     = 10 * 60 * 1000; // 10 minutes
const HOURLY_WINDOW_MS    = 60 * 60 * 1000; // 60 minutes
const OPS_ALERT_EMAIL     = process.env.OPS_ALERT_EMAIL || 'support@praqen.com';

class BalanceAnomalyMonitor {
  constructor() {
    this.userCreditHistory = new Map(); // userId -> [{ timestamp, amount, currency, txHash }]
    this.activeAlerts      = [];        // [{ id, userId, username, severity, title, message, amount, currency, txHash, createdAt, resolved }]
    this.isRunning         = false;
    this.sweepInterval     = null;
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
            <p style="font-size: 12px; color: #6B7280;">Please inspect the user's account and transaction ledger on the Admin Panel: <a href="http://localhost:3000/admin" style="color: #DC2626; font-weight: bold;">Open Admin Dashboard</a></p>
          </div>
        `,
      });
    } catch (e) {
      console.error('[BalanceAnomalyMonitor] Email alert dispatch failed:', e.message);
    }

    // 2. Telegram Alert
    try {
      const telegramMsg = `🚨 *PRAQEN SECURITY ALERT*\n\n*${fullAlert.title}*\n• *User:* @${fullAlert.username || fullAlert.userId.slice(0, 8)}\n• *Amount:* ${fullAlert.amount} ${fullAlert.currency}\n• *Type:* ${fullAlert.type}\n• *TX:* ${fullAlert.txHash ? fullAlert.txHash.slice(0, 16) + '…' : 'None'}\n\nInspect on Admin Panel: http://localhost:3000/admin`;
      sendTelegramAlert(fullAlert.userId, telegramMsg).catch(() => {});
    } catch (e) {
      console.error('[BalanceAnomalyMonitor] Telegram alert dispatch failed:', e.message);
    }

    // 3. Persist to DB table if available
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id:    fullAlert.userId,
        type:       'system',
        title:      `🛡️ Security notice on your account`,
        message:    `A large balance adjustment was processed on your wallet.`,
        action:     '/wallet',
        is_read:    false,
        created_at: fullAlert.createdAt,
      });
    } catch (_) {}
  }

  // ── Periodic Drift Check (Compares ledger sum vs wallets) ───────────────────
  async runPeriodicDriftCheck() {
    try {
      const { data: wallets } = await supabaseAdmin.from('wallets').select('user_id, balance_btc, balance_usdt');
      const { data: allTx } = await supabaseAdmin
        .from('wallet_transactions')
        .select('user_id, type, currency, amount_btc, amount_usdt, status')
        .in('status', ['CONFIRMED', 'COMPLETED']);

      if (!wallets || !allTx) return;

      const ledgerMap = new Map();
      for (const tx of allTx) {
        const cur = ledgerMap.get(tx.user_id) || { btc: 0, usdt: 0 };
        const btc = parseFloat(tx.amount_btc || 0);
        const usdt = parseFloat(tx.amount_usdt || 0);

        if (tx.type === 'DEPOSIT' || tx.type === 'TRANSFER_IN' || tx.type === 'ESCROW_RELEASE' || tx.type === 'REFUND') {
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
