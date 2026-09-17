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
const axios       = require('axios');
const { sendSystemAlert } = require('./pushNotificationService');
const { sendTelegramAlert } = require('./telegramService');
const { createClient }    = require('@supabase/supabase-js');
const tronWallet          = require('./tronWalletService');
const tronHotWallet       = require('./tronHotWallet');
const emailService        = require('./emailService');            // working transport: Resend → Brevo SMTP (+ email_logs)
const { isDepositTooOld, MAX_DEPOSIT_AGE_HOURS } = require('./depositAgeGuard'); // containment guard, see depositAgeGuard.js
const balanceAnomalyMonitor = require('./balanceAnomalyMonitor');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// USDT has no real-time push feed (unlike BTC's mempool.space websocket), so this poll
// interval IS the deposit-detection latency users experience. Kept short — TronGrid is
// called with an API key (TRONGRID_API_KEY, higher rate limit) and batched 5-at-a-time.
const POLL_INTERVAL_MS = 300 * 1000; // 5 minutes — raised from 90s to cut TronGrid 429s. NOTE: USDT has no push feed, so this IS the worst-case USDT deposit-detection latency. Lower it (e.g. 180000) if 5 min is too slow, or fix the 429s at the source by confirming TRONGRID_API_KEY is set.
const DUST_THRESHOLD   = 0.01;            // ignore deposits < $0.01 USDT

// Email is sent via emailService (Resend → Brevo SMTP), required above. The old
// nodemailer 'gmail' transport here used EMAIL_USER/EMAIL_PASS, which are not
// configured in this environment, so every alert/notification it sent was
// silently dropped — removed 2026-09-03.

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
    this._coldCursor     = 0; // round-robin position through the cold address set (2.3b)
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

    // ── 2.3b — don't scan all ~1,600 addresses every 5-minute cycle (a full
    // sequential pass took ~15 min and overran the timer). Split into:
    //   HOT  — users who received a USDT deposit recently or have an open
    //          reconciliation flag → scanned EVERY cycle (near-real-time).
    //   COLD — everyone else → 1/USDT_SCAN_SHARDS per cycle, round-robin, so
    //          every cold address is still covered within a few cycles.
    // Set USDT_SCAN_ALL=true to revert to "scan everything every cycle".
    const SHARDS   = Math.max(1, parseInt(process.env.USDT_SCAN_SHARDS || '6', 10));
    const HOT_DAYS = Math.max(1, parseInt(process.env.USDT_HOT_LOOKBACK_DAYS || '10', 10));
    const SCAN_ALL = process.env.USDT_SCAN_ALL === 'true';

    let toScan;
    if (SCAN_ALL) {
      toScan = wallets;
    } else {
      const sinceISO = new Date(Date.now() - HOT_DAYS * 864e5).toISOString();
      const [{ data: recentDep }, { data: recentDtv }, { data: openFlags }, { data: everTrackedUsdt }] = await Promise.all([
        supabaseAdmin.from('wallet_transactions').select('user_id')
          .eq('type', 'DEPOSIT').eq('currency', 'USDT').gte('created_at', sinceISO),
        supabaseAdmin.from('deposit_tracking_v2').select('user_id')
          .eq('currency', 'USDT').gte('created_at', sinceISO),
        supabaseAdmin.from('reconciliation_flags').select('user_id')
          .eq('currency', 'USDT').eq('status', 'RECONCILIATION_REQUIRED'),
        // ALL-TIME, no date filter — used only to find users who have NEVER had
        // a USDT deposit_tracking_v2 row. A first-time depositor has no "hot"
        // signal from the checks above (nothing recent to be recent about), so
        // without this they land in the cold pool and can sit unscanned for
        // hours despite an on-chain deposit already having arrived — exactly
        // what happened to a real deposit on 2026-09-17. Cost of this query
        // grows with the table, same tradeoff already accepted elsewhere here.
        supabaseAdmin.from('deposit_tracking_v2').select('user_id').eq('currency', 'USDT'),
      ]);
      const hotIds = new Set([
        ...(recentDep || []).map(r => r.user_id),
        ...(recentDtv || []).map(r => r.user_id),
        ...(openFlags || []).map(r => r.user_id),
      ]);
      const everTrackedIds = new Set((everTrackedUsdt || []).map(r => r.user_id));
      const isFirstTimer = w => !everTrackedIds.has(w.user_id);
      const hot  = wallets.filter(w => hotIds.has(w.user_id) || isFirstTimer(w));
      const cold = wallets.filter(w => !hotIds.has(w.user_id) && !isFirstTimer(w));

      const shardSize = Math.ceil(cold.length / SHARDS) || cold.length;
      const start = (this._coldCursor % SHARDS) * shardSize;
      const coldSlice = cold.slice(start, start + shardSize);
      this._coldCursor = (this._coldCursor + 1) % SHARDS;

      toScan = [...hot, ...coldSlice];
      console.log(`[USDTMonitor] 2.3b — scanning ${toScan.length} (hot ${hot.length} + cold slice ${coldSlice.length} of ${cold.length}) this cycle`);
    }
    if (SCAN_ALL) console.log(`[USDTMonitor] Scanning ${toScan.length} Tron address(es) (USDT_SCAN_ALL)...`);

    // Sequential, one request at a time — this TronGrid key's sustainable rate is
    // low; concurrency previously got almost every request 429'd. Kept sequential;
    // 2.3b just shrinks how many addresses each cycle touches.
    const REQUEST_SPACING_MS = 550;
    for (const w of toScan) {
      await this.checkUserDeposit({
        userId:          w.user_id,
        address:         w.tron_address,
        username:        nameMap[w.user_id] || w.user_id.slice(0, 8),
        lastOnchainUsdt: parseFloat(w.last_onchain_usdt || 0),
      });
      await this.sleep(REQUEST_SPACING_MS);
    }
  }

  // ── Fetch confirmed incoming USDT TRC-20 transfers to this address ────────
  // TronGrid's transfer-history endpoint — this is what makes transaction-hash
  // tracking possible here, same reasoning as depositMonitor.js's
  // _fetchAddressTxs: a balance-only read (getUSDTBalance) can tell us THAT the
  // balance changed, never WHICH transfer(s) caused it. only_to:true excludes
  // outgoing transfers — critical, since a sweep sends USDT OUT of this exact
  // address and must never be mistaken for an incoming deposit.
  async _fetchIncomingTransfers(address) {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
    const resp = await axios.get(`https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`, {
      headers,
      params: {
        contract_address: process.env.TRON_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        limit: 20,
        only_confirmed: true,
        only_to: true,
      },
      timeout: 14000,
    });
    return resp.data?.data || [];
  }

  // ── Check one Tron address for new USDT deposits (transaction-hash tracking) ──
  // Replaces the old balance-snapshot comparison ("is the current balance
  // higher than last time?"), which had the same permanent blind spot as the
  // BTC monitor: if a sweep moved the USDT out before the next check ran, the
  // balance returned to baseline and the deposit became invisible forever.
  // Tracking by transaction hash instead (deposit_tracking_v2, shared with
  // depositMonitor.js) means once a transfer's txid has been seen, it can
  // never become invisible again, regardless of what a sweep does to the
  // address's balance afterward.
  async checkUserDeposit({ userId, address, username }) {
    try {
      if (!tronWallet.isValidTronAddress(address)) {
        console.log(`[USDTMonitor] ⚠️  Skipping invalid Tron address for ${userId.slice(0,8)}: ${address}`);
        return;
      }

      // ── Step 1: Fetch this address's incoming USDT transfers ─────────────
      const transfers = await this._fetchIncomingTransfers(address);
      if (!transfers.length) return;

      // ── Step 2: Convert to candidates above dust ──────────────────────────
      const candidates = [];
      for (const t of transfers) {
        if (!t.transaction_id) continue;
        // CONTAINMENT GUARD (2026-09-03): never treat a transfer older than
        // MAX_DEPOSIT_AGE_HOURS as new. TronGrid returns the 20 most-recent
        // incoming transfers every poll, so for a low-volume address the SAME
        // historic (already-swept, already-credited) transfers reappear on every
        // cycle — that is exactly what got several users credited a second time
        // once deposit_tracking_v2 shipped (see depositAgeGuard.js). block_timestamp
        // is ms-epoch from TronGrid.
        if (isDepositTooOld(t.block_timestamp)) {
          console.warn(`[USDTMonitor] ⏸  Skipping transfer ${String(t.transaction_id).slice(0, 12)}… for ${username} — confirmed ${MAX_DEPOSIT_AGE_HOURS}h+ ago; will NOT auto-credit. If genuinely missed, credit via the reviewed back-fill. addr=${address}`);
          continue;
        }
        const amountUsdt = parseFloat((Number(t.value || 0) / 1e6).toFixed(6)); // USDT TRC-20: 6 decimals
        if (amountUsdt < DUST_THRESHOLD) continue;
        candidates.push({ txHash: t.transaction_id, amountUsdt });
      }
      if (!candidates.length) return;

      // ── Step 3: Skip anything already credited. Checked against BOTH ledgers:
      //   • deposit_tracking_v2 — the txid tracker (rows since ~2026-08).
      //   • wallet_transactions — the real credit ledger, matched on the
      //     deterministic idempotency key `USDT:<userId>:<txHash>`. Deposits
      //     credited before deposit_tracking_v2 existed have no tracker row, but
      //     once back-filled (scripts/backfill-deposit-idempotency-keys.js +
      //     scripts/backfill-deposit-tracking-v2.js) they carry this key — so an
      //     old, already-credited transfer re-delivered here can never be credited
      //     twice, independent of the age guard. This check only ever PREVENTS a
      //     credit; a key match is unambiguous, so it cannot cause a false skip.
      const txHashes = candidates.map(c => c.txHash);
      const idemKeys = txHashes.map(h => `USDT:${userId}:${h}`);
      const [{ data: known }, { data: ledgerHits }] = await Promise.all([
        supabaseAdmin.from('deposit_tracking_v2')
          .select('tx_hash, credited').eq('address', address).in('tx_hash', txHashes),
        supabaseAdmin.from('wallet_transactions')
          .select('idempotency_key, tx_hash').eq('user_id', userId).eq('type', 'DEPOSIT')
          .in('idempotency_key', idemKeys),
      ]);
      const ledgerTxids = new Set(
        (ledgerHits || []).map(r => (r.idempotency_key || '').split(':').pop() || r.tx_hash).filter(Boolean)
      );
      const creditedSet = new Set([
        ...(known || []).filter(k => k.credited).map(k => k.tx_hash),
        ...ledgerTxids,
      ]);
      const seenSet = new Set((known || []).map(k => k.tx_hash));

      for (const { txHash, amountUsdt } of candidates) {
        if (creditedSet.has(txHash)) {
          if (!seenSet.has(txHash) && ledgerTxids.has(txHash)) {
            console.log(`[USDTMonitor] tx ${String(txHash).slice(0, 12)}… already credited (ledger key match), no tracker row — skipping. Run the deposit_tracking_v2 back-fill to record the marker.`);
          }
          continue;
        }
        await this.creditConfirmedDeposit({ userId, username, address, txHash, depositUsdt: amountUsdt, alreadySeen: seenSet.has(txHash) });
      }

      // Best-effort: keep last_onchain_usdt roughly in sync for anything else
      // that still reads it for display/diagnostics. It is no longer used to
      // DECIDE whether a deposit is new — deposit_tracking_v2 is — so a stale
      // value here can no longer cause a missed or duplicate credit.
      try {
        const onchainUsdt = await tronWallet.getUSDTBalance(address);
        supabaseAdmin.from('user_wallets').update({ last_onchain_usdt: onchainUsdt }).eq('user_id', userId).then(null, () => {});
      } catch (_) {}

    } catch (err) {
      console.error(`[USDTMonitor] Error for ${address?.slice(0, 12)}…:`, err.message);
    }
  }

  // ── Credit one specific confirmed transfer, exactly once, ever ────────────
  // Records the txid in deposit_tracking_v2 BEFORE attempting the credit (the
  // idempotency gate — same "claim, then act" shape the old checkpoint design
  // used, just keyed on a permanent txid instead of a balance value that a
  // sweep can quietly erase), then calls the exact same atomic
  // praqen_credit_deposit RPC this monitor has always used. This function
  // changes WHEN a deposit is recognized as new — it does not change HOW it is
  // credited, and it never moves or sends any funds itself.
  async creditConfirmedDeposit({ userId, username, address, txHash, depositUsdt, alreadySeen }) {
    if (!alreadySeen) {
      const { error: insErr } = await supabaseAdmin.from('deposit_tracking_v2').insert({
        tx_hash: txHash, address, user_id: userId, currency: 'USDT', amount: depositUsdt,
        credited: false, detected_by: 'realtime_monitor',
      });
      if (insErr) {
        // Unique violation means another concurrent check already claimed this
        // txid first — let that one proceed, this one backs off cleanly.
        if (/duplicate|unique/i.test(insErr.message || '')) {
          console.log(`[USDTMonitor] ${txHash.slice(0, 12)}… already claimed by a concurrent check — skipping.`);
          return;
        }
        console.error(`[USDTMonitor] Failed to record ${txHash.slice(0, 12)}… in deposit_tracking_v2:`, insErr.message);
        return; // don't credit without a recorded claim — same fail-safe spirit as the old checkpoint-first design
      }
    }

    console.log(`\n💰 [USDTMonitor] New deposit detected for ${username}: ${depositUsdt} USDT`);
    console.log(`   Address : ${address}`);
    console.log(`   TX hash : ${txHash}`);

    // ── Atomic deposit credit — unchanged RPC, unchanged guarantees. Only the
    // idempotency key changed: a txid instead of an on-chain balance value,
    // since the txid is what's actually permanent now.
    const usdtIdempotencyKey = `USDT:${userId}:${txHash}`;
    let newUsdt;
    try {
      const { data: rpcBalance, error: creditErr } = await supabaseAdmin.rpc('praqen_credit_deposit', {
        p_user_id:         userId,
        p_currency:        'USDT',
        p_amount:          depositUsdt,
        p_onchain_balance: depositUsdt, // informational only now — deposit_tracking_v2 gates re-processing, not this figure
        p_idempotency_key: usdtIdempotencyKey,
        p_note:            `USDT deposit ${txHash.slice(0, 16)}… to ${address.slice(0, 20)}…`,
      });
      if (creditErr) throw creditErr;
      newUsdt = parseFloat(rpcBalance);
    } catch (creditErr) {
      if (/duplicate|unique/i.test(creditErr.message || '') || /idempotency_key/i.test(creditErr.message || '')) {
        console.log(`[USDTMonitor] ${txHash.slice(0, 12)}… was already credited under this idempotency key — marking as credited.`);
        await supabaseAdmin.from('deposit_tracking_v2')
          .update({ credited: true, credited_at: new Date().toISOString() })
          .eq('tx_hash', txHash).eq('address', address);
        return;
      }
      // Nothing was committed (the RPC is one transaction). Leave credited=false
      // so the next poll retries this exact txid automatically — it's already
      // recorded, so it can't be double-counted, only retried until it succeeds.
      console.error(`🚨 [USDTMonitor] praqen_credit_deposit FAILED for ${username} (tx ${txHash.slice(0, 12)}…) — will retry automatically on next check: ${creditErr.message}`);
      await supabaseAdmin.from('deposit_tracking_v2').update({ credit_error: creditErr.message }).eq('tx_hash', txHash).eq('address', address);
      this.alertOpsOfCreditFailure(username, userId, depositUsdt, 'USDT', creditErr.message).catch(() => {});
      return;
    }

    await supabaseAdmin.from('deposit_tracking_v2')
      .update({ credited: true, credited_at: new Date().toISOString() })
      .eq('tx_hash', txHash).eq('address', address);

    // ── Real-time balance spike & anomaly check ──────────────────────────────
    balanceAnomalyMonitor.checkCreditEvent({
      userId,
      username,
      currency: 'USDT',
      amount: depositUsdt,
      txHash,
      newBalance: newUsdt,
    }).catch(err => console.error('[USDTMonitor] Anomaly monitor error:', err.message));

    // ── In-app notification ─────────────────────────────────────────────────
    await supabaseAdmin.from('notifications').insert({
      user_id:    userId,
      type:       'wallet',
      title:      '💵 USDT Received!',
      message:    `$${depositUsdt.toFixed(2)} USDT credited to your wallet. Balance: $${newUsdt.toFixed(2)} USDT`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    // ── Push notification (fire-and-forget) ─────────────────────────────────
    sendSystemAlert(
      userId,
      '💵 USDT Received!',
      `$${depositUsdt.toFixed(2)} USDT deposited to your PRAQEN wallet`,
      'https://praqen.com/wallet'
    ).catch(err => console.error('[USDTMonitor] Push error:', err.message));

    // ── Telegram notification ───────────────────────────────────────────────
    sendTelegramAlert(userId, `✅ Deposit received! $${depositUsdt.toFixed(2)} USDT credited to your wallet. Balance: $${newUsdt.toFixed(2)} USDT`).catch(() => {});

    // ── Email (fire-and-forget) ─────────────────────────────────────────────
    this.sendDepositEmail(userId, username, depositUsdt, newUsdt, address)
        .catch(err => console.error('[USDTMonitor] Email error:', err.message));

    console.log(`✅ [USDTMonitor] Credited $${depositUsdt} USDT to ${username} | New balance: $${newUsdt.toFixed(2)} USDT | TX: ${txHash.slice(0, 16)}…`);

    // ── Sweep deposit → hot wallet (non-fatal, fire-and-forget) ─────────────
    // Unchanged from before — this line already existed and already triggers a
    // real fund movement (address → hot wallet) as a side effect of a credited
    // deposit. Nothing about this step's behavior changes here.
    tronHotWallet.sweepFromUserAddress(userId, address, depositUsdt)
      .then(r => { if (r?.deferred) console.log(`[USDTMonitor] Sweep queued for ${username}: ${r.reason}`); })
      .catch(e => console.error(`[USDTMonitor] Sweep trigger error (non-fatal): ${e.message}`));
  }

  // ── Critical alert: a real on-chain deposit failed to credit the user's balance ──
  // This is a fund-safety incident, not a routine error — the deposit-detection claim
  // already advanced, so without a human catching this, the deposit is silently lost
  // from the user's perspective until support intervenes.
  async alertOpsOfCreditFailure(username, userId, amount, currency, errMsg) {
    try {
      // Routed through emailService (Resend → Brevo SMTP, logged to email_logs).
      // The old nodemailer 'gmail' transport used EMAIL_USER/EMAIL_PASS, which are
      // not set here, so every one of these fund-safety alerts was silently
      // dropped (BALANCE_MISMATCH_INVESTIGATION.md / remediation SEC-4).
      await emailService.sendEmail({
        to:      process.env.OPS_ALERT_EMAIL || 'support@praqen.com',
        subject: `🚨 Deposit credit FAILED — ${currency} — manual review needed`,
        type:    'deposit_credit_failure_alert',
        html: `<p><strong>A confirmed on-chain deposit could not be credited to a user's wallet.</strong></p>
               <p>User: ${username} (${userId})<br/>
               Amount: ${amount} ${currency}<br/>
               Error: ${errMsg}</p>
               <p>The deposit-detection claim was reverted so it will be retried automatically —
               but if this keeps failing, the user's real on-chain funds will not reach their
               PRAQEN balance. Please check this account's wallet row directly.</p>`,
      });
    } catch (e) {
      console.error('🚨 [USDTMonitor] Even the ops alert email failed:', e.message);
    }
  }

  // ── Email notification ─────────────────────────────────────────────────────
  async sendDepositEmail(userId, username, depositUsdt, newBalance, address) {
    try {
      const { data: user } = await supabaseAdmin
        .from('users').select('email, username').eq('id', userId).single();
      if (!user?.email) return;

      const displayName = user.username || username;
      // Routed through emailService (Resend → Brevo SMTP) — the old nodemailer
      // 'gmail' transport's creds are unset here, so this user-facing "deposit
      // received" email was never actually sending.
      await emailService.sendEmail({
        userId,
        to:      user.email,
        subject: `💵 $${depositUsdt.toFixed(2)} USDT received — PRAQEN`,
        type:    'deposit_confirmed_usdt',
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
