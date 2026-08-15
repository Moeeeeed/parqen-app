// services/usdtDepositMonitor.js
// PRAQEN — Automatic USDT TRC-20 Deposit Monitor
// Mirrors depositMonitor.js but scans Tron addresses for incoming USDT.
// Approach: compare on-chain USDT balance vs last_onchain_usdt stored in user_wallets.
// On new deposit:
//   1. Updates user_wallets.last_onchain_usdt (idempotency guard)
//   2. Credits wallets.balance_usdt
//   3. Inserts wallet_transactions (type=DEPOSIT, currency=USDT)
//   4. In-app notification
//   5. OneSignal push notification
//   6. Email via Nodemailer

require('dotenv').config();
const nodemailer = require('nodemailer');
const { sendSystemAlert } = require('./pushNotificationService');
const { createClient }    = require('@supabase/supabase-js');
const tronWallet          = require('./tronWalletService');
const tronHotWallet       = require('./tronHotWallet');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// USDT has no real-time push feed (unlike BTC's mempool.space websocket), so this poll
// interval IS the deposit-detection latency users experience. Kept short — TronGrid is
// called with an API key (TRONGRID_API_KEY, higher rate limit) and batched 5-at-a-time.
const POLL_INTERVAL_MS = 90 * 1000; // 90 seconds
const DUST_THRESHOLD   = 0.01;            // ignore deposits < $0.01 USDT

const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Email HTML for USDT deposit ───────────────────────────────────────────────
function depositEmailHtml(username, depositUsdt, newBalance, address) {
  const explorerUrl = `https://tronscan.org/#/address/${address}`;
  const year        = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:900;color:#fff;letter-spacing:2px;">PRA<span style="color:#F4A422;">QEN</span></p>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.65);">Global P2P Trading Platform</p>
          </td>
        </tr>
        <tr>
          <td style="background:#10B981;padding:14px 32px;text-align:center;">
            <p style="margin:0;font-size:15px;font-weight:800;color:#fff;">💵 USDT Deposit Confirmed</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#374151;">Hi <strong>${username}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">
              Your USDT (TRC-20) deposit has been confirmed on the Tron network and credited to your PRAQEN wallet.
            </p>
            <div style="background:#F0FAF5;border:2px solid #2D6A4F;border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:1px;">Amount Received</p>
              <p style="margin:0;font-size:32px;font-weight:900;color:#1B4332;">$${depositUsdt.toFixed(2)} USDT</p>
              <p style="margin:8px 0 0;font-size:13px;color:#2D6A4F;font-weight:600;">New wallet balance: $${newBalance.toFixed(2)} USDT</p>
            </div>
            <a href="${explorerUrl}" style="display:block;background:#2D6A4F;color:#fff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-size:14px;font-weight:800;margin-bottom:12px;">
              View Address on TronScan →
            </a>
            <a href="https://praqen.com/wallet" style="display:block;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;text-align:center;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700;">
              Open My Wallet
            </a>
            <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;line-height:1.6;text-align:center;">
              You received this because a USDT deposit was made to your PRAQEN Tron wallet address.<br>
              Need help? <a href="mailto:hello@praqen.com" style="color:#2D6A4F;">hello@praqen.com</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9CA3AF;">© ${year} PRAQEN · USDT TRC-20 on Tron Network · 1% fee on trades only</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────

class USDTDepositMonitor {

  constructor() {
    this.isRunning       = false;
    this.intervalId      = null;
    this.cycleInProgress = false;
  }

  // ── Start background polling ───────────────────────────────────────────────
  start() {
    if (this.isRunning) {
      console.log('[USDTMonitor] Already running — skipping duplicate start');
      return;
    }
    this.isRunning = true;

    console.log(`\n🔍 USDT Deposit Monitor started — MAINNET (Tron)`);
    console.log(`   Polling every ${POLL_INTERVAL_MS / 60000} minutes`);

    // Run immediately, then on interval
    this.runFullCycle();
    this.intervalId = setInterval(() => this.runFullCycle(), POLL_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning  = false;
    console.log('[USDTMonitor] Stopped');
  }

  // ── One full polling cycle ─────────────────────────────────────────────────
  async runFullCycle() {
    // With a 90s interval, guard against a slow cycle overlapping the next tick —
    // overlapping cycles would double-hit TronGrid and race on the same rows.
    if (this.cycleInProgress) {
      console.log('[USDTMonitor] Previous cycle still running — skipping this tick');
      return;
    }
    this.cycleInProgress = true;
    const start = Date.now();
    console.log(`\n[USDTMonitor] ⏱  Cycle start ${new Date().toISOString()}`);
    try {
      await this.checkAllUserDeposits();
    } catch (err) {
      console.error('[USDTMonitor] Deposit check error:', err.message);
    }
    // Retry any sweeps that previously failed (non-fatal if this errors too)
    try {
      await tronHotWallet.processPendingSweeps();
    } catch (err) {
      console.error('[USDTMonitor] Pending sweep processor error:', err.message);
    }
    console.log(`[USDTMonitor] ✅ Cycle done in ${Date.now() - start}ms\n`);
    this.cycleInProgress = false;
  }

  // ── Fetch all Tron addresses to scan ──────────────────────────────────────
  async checkAllUserDeposits() {
    // Try with last_onchain_usdt first; fall back to selecting without it if column is missing
    let wallets, error;
    ({ data: wallets, error } = await supabaseAdmin
      .from('user_wallets')
      .select('user_id, tron_address, last_onchain_usdt')
      .not('tron_address', 'is', null)
      .neq('tron_address', ''));

    if (error && error.message.includes('last_onchain_usdt')) {
      // SAFETY: without this column we cannot track what was already credited.
      // Crediting with last_onchain_usdt=0 would double-credit every cycle.
      // Block ALL crediting until the migration is applied.
      console.error(
        '[USDTMonitor] ⛔ HALTED — last_onchain_usdt column missing from user_wallets.\n' +
        '   Run this in Supabase SQL Editor, then restart:\n' +
        '   ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS last_onchain_usdt NUMERIC DEFAULT 0;'
      );
      return;
    }

    if (error) {
      console.warn('[USDTMonitor] user_wallets fetch failed:', error.message);
      return;
    }

    if (!wallets || wallets.length === 0) {
      console.log('[USDTMonitor] No Tron addresses to monitor yet');
      return;
    }

    // Batch-fetch usernames in one query
    const userIds = wallets.map(w => w.user_id);
    const { data: users } = await supabaseAdmin
      .from('users').select('id, username').in('id', userIds);
    const nameMap = {};
    for (const u of (users || [])) nameMap[u.id] = u.username;

    console.log(`[USDTMonitor] Scanning ${wallets.length} Tron address(es)...`);

    // Sequential, one request at a time — this TronGrid key's actual sustainable
    // rate is ~2 req/sec; firing several requests concurrently (the old batch-of-5
    // approach) got almost every request 429'd. A full pass over many addresses
    // now takes longer, but actually succeeds instead of mostly failing.
    const REQUEST_SPACING_MS = 550;
    for (const w of wallets) {
      await this.checkUserDeposit({
        userId:          w.user_id,
        address:         w.tron_address,
        username:        nameMap[w.user_id] || w.user_id.slice(0, 8),
        lastOnchainUsdt: parseFloat(w.last_onchain_usdt || 0),
      });
      await this.sleep(REQUEST_SPACING_MS);
    }
  }

  // ── Check one Tron address for new USDT deposits ──────────────────────────
  async checkUserDeposit({ userId, address, username, lastOnchainUsdt }) {
    try {
      if (!tronWallet.isValidTronAddress(address)) {
        console.log(`[USDTMonitor] ⚠️  Skipping invalid Tron address for ${userId.slice(0,8)}: ${address}`);
        return;
      }

      // ── Step 1: Get current on-chain USDT balance ────────────────────────
      const onchainUsdt = await tronWallet.getUSDTBalance(address);

      // ── Step 2: Compare with last known on-chain balance ─────────────────
      // Small epsilon to avoid floating-point false positives
      if (onchainUsdt <= lastOnchainUsdt + 0.0001) return;

      const depositUsdt = parseFloat((onchainUsdt - lastOnchainUsdt).toFixed(6));
      if (depositUsdt < DUST_THRESHOLD) return;

      console.log(`\n💰 [USDTMonitor] New deposit detected for ${username}: ${depositUsdt} USDT`);
      console.log(`   Address     : ${address}`);
      console.log(`   On-chain now: ${onchainUsdt} USDT | Last: ${lastOnchainUsdt} USDT`);

      // ── Step 3: Idempotency guard — update last_onchain_usdt FIRST ───────
      const { error: claimErr } = await supabaseAdmin
        .from('user_wallets')
        .update({ last_onchain_usdt: onchainUsdt, updated_at: new Date().toISOString() })
        .eq('user_id', userId);

      if (claimErr) {
        if (claimErr.message.includes('last_onchain_usdt')) {
          console.warn(`[USDTMonitor] last_onchain_usdt column missing — run: ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS last_onchain_usdt NUMERIC DEFAULT 0;`);
        } else {
          console.warn(`[USDTMonitor] last_onchain_usdt update failed for ${username}:`, claimErr.message);
        }
        // Proceed — wallet_transactions insert acts as fallback idempotency
      }

      // ── Step 4: Get current USDT balance from wallets table ───────────────
      const { data: walRow } = await supabaseAdmin
        .from('wallets').select('balance_usdt').eq('user_id', userId).maybeSingle();

      const currentUsdt = parseFloat(walRow?.balance_usdt || 0);
      const newUsdt     = parseFloat((currentUsdt + depositUsdt).toFixed(6));

      // ── Step 5: Credit wallets.balance_usdt (single source of truth) ─────
      const creditResult = walRow
        ? await supabaseAdmin.from('wallets')
            .update({ balance_usdt: newUsdt, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
        : await supabaseAdmin.from('wallets')
            .insert({
              user_id:            userId,
              balance_usdt:       depositUsdt,
              locked_balance_usdt: 0,
              balance_btc:        0,
              locked_balance_btc: 0,
              updated_at:         new Date().toISOString(),
            });

      if (creditResult.error) {
        console.error(`[USDTMonitor] wallets credit failed for ${username}:`, creditResult.error.message);
        return;
      }

      // ── Step 6: Record in wallet_transactions ─────────────────────────────
      await supabaseAdmin.from('wallet_transactions').insert({
        user_id:     userId,
        type:        'DEPOSIT',
        currency:    'USDT',
        amount_btc:  0,
        amount_usdt: depositUsdt,
        status:      'CONFIRMED',
        notes:       `USDT deposit to ${address.slice(0, 20)}…`,
        created_at:  new Date().toISOString(),
      }).then(({ error: e }) => {
        if (e) console.warn('[USDTMonitor] wallet_transactions insert error:', e.message);
      });

      // ── Step 7: In-app notification ───────────────────────────────────────
      await supabaseAdmin.from('notifications').insert({
        user_id:    userId,
        type:       'wallet',
        title:      '💵 USDT Received!',
        message:    `$${depositUsdt.toFixed(2)} USDT credited to your wallet. Balance: $${newUsdt.toFixed(2)} USDT`,
        action:     '/wallet',
        is_read:    false,
        created_at: new Date().toISOString(),
      });

      // ── Step 8: Push notification (fire-and-forget) ───────────────────────
      sendSystemAlert(
        userId,
        '💵 USDT Received!',
        `$${depositUsdt.toFixed(2)} USDT deposited to your PRAQEN wallet`,
        'https://praqen.com/wallet'
      ).catch(err => console.error('[USDTMonitor] Push error:', err.message));

      // ── Step 9: Email (fire-and-forget) ──────────────────────────────────
      this.sendDepositEmail(userId, username, depositUsdt, newUsdt, address)
          .catch(err => console.error('[USDTMonitor] Email error:', err.message));

      console.log(`✅ [USDTMonitor] Credited $${depositUsdt} USDT to ${username} | New balance: $${newUsdt.toFixed(2)} USDT`);

      // ── Step 10: Sweep deposit → hot wallet (non-fatal, fire-and-forget) ──
      // User's internal balance is already safe in the DB (Step 5).
      // Sweep consolidates on-chain USDT into hot wallet for future withdrawals.
      tronHotWallet.sweepFromUserAddress(userId, address, depositUsdt)
        .then(r => { if (r?.deferred) console.log(`[USDTMonitor] Sweep queued for ${username}: ${r.reason}`); })
        .catch(e => console.error(`[USDTMonitor] Sweep trigger error (non-fatal): ${e.message}`));

    } catch (err) {
      console.error(`[USDTMonitor] Error for ${address?.slice(0, 12)}…:`, err.message);
    }
  }

  // ── Email notification ─────────────────────────────────────────────────────
  async sendDepositEmail(userId, username, depositUsdt, newBalance, address) {
    try {
      const { data: user } = await supabaseAdmin
        .from('users').select('email, username').eq('id', userId).single();
      if (!user?.email) return;

      const displayName = user.username || username;
      await emailTransporter.sendMail({
        from:    '"PRAQEN" <support@praqen.com>',
        to:      user.email,
        subject: `💵 $${depositUsdt.toFixed(2)} USDT received — PRAQEN`,
        html:    depositEmailHtml(displayName, depositUsdt, newBalance, address),
      });
      console.log(`📧 [USDTMonitor] Email sent to user ${userId.slice(0, 8)} (${user.email})`);
    } catch (err) {
      console.error('[USDTMonitor] sendDepositEmail error:', err.message);
    }
  }

  getStatus() {
    return { running: this.isRunning, poll_interval_min: POLL_INTERVAL_MS / 60000 };
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new USDTDepositMonitor();
