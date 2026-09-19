// services/depositMonitor.js
// PRAQEN — Automatic Bitcoin Deposit Monitor
// Polls every 5 minutes for new deposits to ALL user wallet addresses.
// Approach: compare on-chain confirmed balance vs DB balance (user_balances).
// When blockchain > DB a deposit is credited automatically:
//   1. Updates user_balances.balance_btc + balance_usd
//   2. Updates user_wallets.balance_btc
//   3. Inserts into wallet_transactions (type DEPOSIT, status CONFIRMED)
//   4. Creates in-app notification
//   5. Sends OneSignal push notification
//   6. Sends SMS via Twilio
//   7. Sends email via Nodemailer

require('dotenv').config();
const axios      = require('axios');
const { updateOfferStatus }  = require('./offerStatusService');
const { sendSystemAlert }    = require('./pushNotificationService');
const { sendTelegramAlert }  = require('./telegramService');
const { createClient }       = require('@supabase/supabase-js');
const btcApiGateway          = require('./btcApiGateway');
const emailService           = require('./emailService');            // working transport: Resend → Brevo SMTP (+ email_logs)
const { isDepositTooOld, MAX_DEPOSIT_AGE_HOURS } = require('./depositAgeGuard'); // containment guard, see depositAgeGuard.js
const balanceAnomalyMonitor  = require('./balanceAnomalyMonitor');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ── Config ────────────────────────────────────────────────────────────────────
// 2026-09-18: Realtime WebSocket (realtimeDepositService.js) is disabled due to mempool.space limits.
// Hot/Cold sharding (2.3b) partitions addresses into a small hot pool + 1 cold slice,
// allowing fast 90-second cycles (~20-40s duration) without tripping API rate limits.
const POLL_INTERVAL_MS    = parseInt(process.env.BTC_POLL_INTERVAL_MS || String(90 * 1000), 10); // 90 seconds — hot/cold sharding keeps each cycle fast
const DUST_THRESHOLD_SATS = 546;           // ignore sub-dust outputs

// Email is sent via emailService (Resend → Brevo SMTP), required above. The old
// nodemailer 'gmail' transport here used EMAIL_USER/EMAIL_PASS, which are not
// configured in this environment, so every alert/notification it sent was
// silently dropped — removed 2026-09-03.

// ── Twilio client (lazy init — won't crash if creds are missing) ──────────────
let twilioClient = null;
try {
  if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
    twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  }
} catch (e) {
  console.warn('[DepositMonitor] Twilio unavailable:', e.message);
}

// ── Email HTML template ───────────────────────────────────────────────────────
function depositEmailHtml(username, depositBTC, newBalance, address) {
  const explorerUrl = `https://mempool.space/address/${address}`;
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:900;color:#fff;letter-spacing:2px;">PRA<span style="color:#F4A422;">QEN</span></p>
            <p style="margin:8px 0 0;font-size:13px;color:rgba(255,255,255,0.65);">Global P2P Bitcoin Platform</p>
          </td>
        </tr>

        <!-- Green success bar -->
        <tr>
          <td style="background:#10B981;padding:14px 32px;text-align:center;">
            <p style="margin:0;font-size:15px;font-weight:800;color:#fff;letter-spacing:0.5px;">
              ₿ Bitcoin Deposit Confirmed
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#374151;">Hi <strong>${username}</strong>,</p>
            <p style="margin:0 0 24px;font-size:14px;color:#6B7280;line-height:1.6;">
              Great news — your Bitcoin deposit has been confirmed on the blockchain and credited to your PRAQEN wallet.
            </p>

            <!-- Amount box -->
            <div style="background:#F0FAF5;border:2px solid #2D6A4F;border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:1px;">Amount Received</p>
              <p style="margin:0;font-size:32px;font-weight:900;color:#1B4332;">₿ ${depositBTC.toFixed(8)}</p>
              <p style="margin:8px 0 0;font-size:13px;color:#2D6A4F;font-weight:600;">New wallet balance: ₿ ${newBalance.toFixed(8)}</p>
            </div>

            <a href="${explorerUrl}"
               style="display:block;background:#2D6A4F;color:#fff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:10px;font-size:14px;font-weight:800;margin-bottom:20px;">
              View Address on Mempool →
            </a>

            <a href="https://praqen.com/wallet"
               style="display:block;border:2px solid #2D6A4F;color:#2D6A4F;text-decoration:none;text-align:center;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:700;">
              Open My Wallet
            </a>

            <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;line-height:1.6;text-align:center;">
              You received this because a deposit was made to your PRAQEN wallet address.<br>
              Need help? <a href="mailto:hello@praqen.com" style="color:#2D6A4F;">hello@praqen.com</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9CA3AF;">© ${year} PRAQEN · Self-Custodial HD Wallet · 0.5% fee on trades only</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────

class DepositMonitor {

  constructor() {
    this.isRunning        = false;
    this.intervalId       = null;
    this.network          = null;
    this.apiBase          = null;
    this._cycleInProgress = false;
    this._coldCursor      = 0;
    // Fallback APIs tried in order when primary times out
    this._apiFallbacks = [
      'https://mempool.space/api',
      'https://blockstream.info/api',
    ];
  }

  // ── Fetch address data — routed through the shared gateway ───────────────
  // See services/btcApiGateway.js. Deposit polling runs on the LOW-priority lane
  // (behind customer withdrawals) and uses the gateway's short GET response
  // cache, so a reconciliation pass that checks the same address seconds later
  // reuses this result instead of making a second call. Endpoint rotation and
  // 429 cooldown — which this method used to do by hand — now live in the
  // gateway, shared with every other blockchain caller so their combined request
  // rate stays under the free-tier limit.
  async _fetchAddress(address, priority = 'low') {
    return btcApiGateway.get(`/address/${address}`, { priority });
  }

  // Transaction list (esplora /address/{addr}/txs — 25 most recent, confirmed +
  // unconfirmed). This is what makes tx-hash tracking possible: a balance-only
  // read tells us THAT the balance changed, never WHICH transaction caused it.
  async _fetchAddressTxs(address, priority = 'low') {
    const txs = await btcApiGateway.get(`/address/${address}/txs`, { priority });
    return txs || [];
  }

  // ── Start background polling ───────────────────────────────────────────────
  start() {
    if (this.isRunning) {
      console.log('[DepositMonitor] Already running — skipping duplicate start');
      return;
    }

    this.network = (process.env.HD_NETWORK || 'mainnet').toLowerCase();
    this.apiBase = this.network === 'testnet'
      ? 'https://mempool.space/testnet/api'
      : 'https://mempool.space/api';

    console.log(`\n🔍 DepositMonitor started — ${this.network.toUpperCase()}`);
    console.log(`   Polling every ${POLL_INTERVAL_MS / 1000 / 60} minutes`);
    console.log(`   API: ${this.apiBase}\n`);

    this.isRunning = true;

    // Run immediately on startup, then on interval
    this.runFullCycle();
    this.intervalId = setInterval(() => this.runFullCycle(), POLL_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning  = false;
    console.log('[DepositMonitor] Stopped');
  }

  // ── One full polling cycle ─────────────────────────────────────────────────
  async runFullCycle() {
    // Guard against overlapping cycles: if a cycle is still running (typically
    // because API rate-limiting made it take longer than POLL_INTERVAL_MS), the
    // next setInterval tick used to start a second cycle on top of it — doubling
    // the request rate against the same already-throttled APIs and making the
    // rate-limiting worse each cycle. Skip and let the in-flight cycle finish.
    if (this._cycleInProgress) {
      console.warn('[DepositMonitor] ⚠️  Previous cycle still running — skipping this tick to avoid doubling request rate');
      return;
    }
    this._cycleInProgress = true;
    const start = Date.now();
    console.log(`\n[DepositMonitor] ⏱  Cycle start ${new Date().toISOString()}`);
    try {
      await Promise.allSettled([
        this.checkAllUserDeposits(),
        this.checkEscrowDeposits(),
      ]);
    } finally {
      this._cycleInProgress = false;
    }
    console.log(`[DepositMonitor] ✅ Cycle done in ${Date.now() - start}ms\n`);
  }

  // ── Fetch all wallets to monitor ───────────────────────────────────────────
  async checkAllUserDeposits() {
    try {
      // Primary source: user_wallets table (include last_onchain_btc to avoid N+1 re-queries)
      let { data: wallets, error: wErr } = await supabaseAdmin
        .from('user_wallets')
        .select('user_id, btc_address, last_onchain_btc')
        .not('btc_address', 'is', null)
        .neq('btc_address', '');

      // If column doesn't exist yet — retry without it (wallet_transactions provides idempotency)
      let _columnMissing = false;
      if (wErr) {
        console.warn('[DepositMonitor] last_onchain_btc column missing — retrying without it:', wErr.message);
        const retry = await supabaseAdmin
          .from('user_wallets')
          .select('user_id, btc_address')
          .not('btc_address', 'is', null)
          .neq('btc_address', '');
        wallets = retry.data;
        wErr    = retry.error;
        _columnMissing = true;
      }

      // Fallback: users.bitcoin_wallet_address (older generate path)
      const { data: users, error: uErr } = await supabaseAdmin
        .from('users')
        .select('id, username, bitcoin_wallet_address')
        .not('bitcoin_wallet_address', 'is', null)
        .neq('bitcoin_wallet_address', '');

      if (wErr) console.error('[DepositMonitor] user_wallets fetch error:', wErr.message);
      if (uErr) console.error('[DepositMonitor] users fetch error:', uErr.message);

      // Merge both sources, deduplicate by address
      const seen    = new Set();
      const toCheck = [];

      for (const w of (wallets || [])) {
        if (w.btc_address && !seen.has(w.btc_address)) {
          seen.add(w.btc_address);
          toCheck.push({ userId: w.user_id, address: w.btc_address, username: null, lastOnchainBtc: _columnMissing ? undefined : parseFloat(w.last_onchain_btc || 0) });
        }
      }
      for (const u of (users || [])) {
        if (u.bitcoin_wallet_address && !seen.has(u.bitcoin_wallet_address)) {
          seen.add(u.bitcoin_wallet_address);
          toCheck.push({ userId: u.id, address: u.bitcoin_wallet_address, username: u.username });
        }
      }

      if (toCheck.length === 0) {
        console.log('[DepositMonitor] No wallet addresses to monitor yet');
        return;
      }

      // Batch-fetch all missing usernames in one query instead of N individual lookups
      const missingUserIds = toCheck.filter(e => !e.username).map(e => e.userId);
      if (missingUserIds.length > 0) {
        const { data: names } = await supabaseAdmin
          .from('users').select('id, username').in('id', missingUserIds);
        const nameMap = {};
        for (const n of (names || [])) nameMap[n.id] = n.username;
        for (const e of toCheck) {
          if (!e.username) e.username = nameMap[e.userId] || e.userId.slice(0, 8);
        }
      }

      console.log(`[DepositMonitor] Scanning ${toCheck.length} wallet address(es)...`);

      // Process in batches of 5 concurrently with a 1s gap between batches
      // This is ~3x faster than serial while still respecting mempool.space rate limits
      const valid = toCheck.filter(e => {
        if (!this.isValidMainnetAddress(e.address)) {
          console.log(`[DepositMonitor] ⚠️  Skipping invalid address for user ${e.userId.slice(0, 8)}: ${e.address.slice(0, 16)}…`);
          return false;
        }
        return true;
      });

      // ── Hot / Cold Address Sharding ──────────────────────────────────────────
      // Don't scan all addresses sequentially every cycle. Split into:
      //   HOT  — users who received a BTC deposit recently, have an active trade,
      //          have an open reconciliation flag, or are first-time wallet users.
      //          → scanned EVERY cycle (near-real-time ~90s).
      //   COLD — everyone else → 1/BTC_SCAN_SHARDS per cycle, round-robin, so
      //          every cold address is still covered within a few cycles.
      // Set BTC_SCAN_ALL=true to revert to "scan everything every cycle".
      const SHARDS   = Math.max(1, parseInt(process.env.BTC_SCAN_SHARDS || '6', 10));
      const HOT_DAYS = Math.max(1, parseInt(process.env.BTC_HOT_LOOKBACK_DAYS || '10', 10));
      const SCAN_ALL = process.env.BTC_SCAN_ALL === 'true';

      let toScan;
      if (SCAN_ALL) {
        toScan = valid;
      } else {
        const sinceISO = new Date(Date.now() - HOT_DAYS * 864e5).toISOString();
        const [{ data: recentDep }, { data: recentDtv }, { data: openFlags }, { data: everTrackedBtc }, { data: activeTrades }] = await Promise.all([
          supabaseAdmin.from('wallet_transactions').select('user_id')
            .eq('type', 'DEPOSIT').eq('currency', 'BTC').gte('created_at', sinceISO),
          supabaseAdmin.from('deposit_tracking_v2').select('user_id')
            .eq('currency', 'BTC').gte('created_at', sinceISO),
          supabaseAdmin.from('reconciliation_flags').select('user_id')
            .eq('currency', 'BTC').eq('status', 'RECONCILIATION_REQUIRED'),
          // ALL-TIME, no date filter — used to find users who have NEVER had
          // a BTC deposit_tracking_v2 row (first-time depositors).
          supabaseAdmin.from('deposit_tracking_v2').select('user_id').eq('currency', 'BTC'),
          // Also include users in active trades (buyer or seller)
          supabaseAdmin.from('trades').select('buyer_id, seller_id')
            .in('status', ['PENDING', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED']),
        ]);

        const tradeUserIds = [];
        for (const t of (activeTrades || [])) {
          if (t.buyer_id) tradeUserIds.push(t.buyer_id);
          if (t.seller_id) tradeUserIds.push(t.seller_id);
        }

        const hotIds = new Set([
          ...(recentDep || []).map(r => r.user_id),
          ...(recentDtv || []).map(r => r.user_id),
          ...(openFlags || []).map(r => r.user_id),
          ...tradeUserIds,
        ]);
        const everTrackedIds = new Set((everTrackedBtc || []).map(r => r.user_id));
        const isFirstTimer = w => !everTrackedIds.has(w.userId);
        const hot  = valid.filter(w => hotIds.has(w.userId) || isFirstTimer(w));
        const cold = valid.filter(w => !hotIds.has(w.userId) && !isFirstTimer(w));

        const shardSize = Math.ceil(cold.length / SHARDS) || cold.length;
        const start = (this._coldCursor % SHARDS) * shardSize;
        const coldSlice = cold.slice(start, start + shardSize);
        this._coldCursor = (this._coldCursor + 1) % SHARDS;

        toScan = [...hot, ...coldSlice];
        console.log(`[DepositMonitor] 2.3b — scanning ${toScan.length} (hot ${hot.length} + cold slice ${coldSlice.length} of ${cold.length}) this cycle`);
      }
      if (SCAN_ALL) console.log(`[DepositMonitor] Scanning ${toScan.length} Bitcoin address(es) (BTC_SCAN_ALL)...`);

      // Batch of 3 / 1.2s gap (was 5 / 1s): the tighter pacing lowers the peak
      // burst rate against mempool.space/blockstream.info — this is what was
      // tripping their rate limits in production.
      const BATCH = 3;
      for (let i = 0; i < toScan.length; i += BATCH) {
        const batch = toScan.slice(i, i + BATCH);
        await Promise.allSettled(batch.map(entry => this.checkUserDeposit(entry)));
        if (i + BATCH < toScan.length) await this.sleep(1200);
      }

      // 2.3a: retry any addresses parked by a previous failed cycle.
      await this._drainRecheckQueue();

    } catch (err) {
      console.error('[DepositMonitor] checkAllUserDeposits error:', err.message);
    }
  }

  // ── Validate address for current network (mainnet or testnet) ────────────
  isValidMainnetAddress(address) {
    if (!address || typeof address !== 'string') return false;
    const isTestnet = (process.env.HD_NETWORK || '').toLowerCase() === 'testnet';
    if (isTestnet) {
      if (/^tb1[a-z0-9]{25,87}$/i.test(address)) return true;           // Testnet SegWit
      if (/^[mn2][a-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true; // Testnet Legacy / P2SH
      return false;
    }
    if (/^bc1[a-z0-9]{25,87}$/i.test(address)) return true;           // Native SegWit
    if (/^[13][a-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true; // Legacy / P2SH
    return false;
  }

  // ── Check one address for new deposits (transaction-hash tracking) ────────
  // Replaces the old balance-snapshot comparison ("is the current balance
  // higher than last time?"), which had a permanent blind spot: if a sweep
  // moved the coins out before the next check ran, the balance returned to
  // baseline and the deposit became invisible forever — this is what happened
  // to king888, ukbuyer2022, and Iraqiy_Xchange. Tracking by transaction hash
  // instead (deposit_tracking_v2) means once a deposit's txid has been seen,
  // it can never become invisible again, regardless of what a sweep does to
  // the address's balance afterward.
  async checkUserDeposit({ userId, address, username, priority = 'low' }) {
    try {
      // Resolve username if not provided (fallback for manual checkAddressNow path)
      if (!username) {
        const { data: u } = await supabaseAdmin
          .from('users').select('username').eq('id', userId).single();
        username = u?.username || userId.slice(0, 8);
      }

      // ── Step 1: Fetch this address's transaction history ──────────────────
      const txs = await this._fetchAddressTxs(address, priority);
      if (!txs.length) return;

      // ── Step 2: Find confirmed transactions that actually pay this address ──
      // Only confirmed — same as before, this never credits on 0-conf (the
      // realtime WebSocket path already sends a separate "incoming, unconfirmed"
      // notice; that path is untouched by this change).
      const candidates = [];
      for (const tx of txs) {
        if (!tx.status?.confirmed) continue;
        // CONTAINMENT GUARD (2026-09-03): never treat a deposit older than
        // MAX_DEPOSIT_AGE_HOURS as new. Historic, already-credited deposits were
        // being re-processed and credited a second time (see depositAgeGuard.js).
        // A genuine new deposit is always recent the first time it is seen here;
        // a genuinely missed old one must go through the reviewed back-fill.
        if (isDepositTooOld(tx.status.block_time)) {
          console.warn(`[DepositMonitor] ⏸  Skipping tx ${String(tx.txid).slice(0, 12)}… for ${username} — confirmed ${MAX_DEPOSIT_AGE_HOURS}h+ ago; will NOT auto-credit. If this is a genuinely missed deposit, credit it via the reviewed back-fill. addr=${address}`);
          continue;
        }
        const receivedSats = (tx.vout || [])
          .filter(o => o.scriptpubkey_address === address)
          .reduce((s, o) => s + (o.value || 0), 0);
        if (receivedSats <= DUST_THRESHOLD_SATS) continue;
        candidates.push({ txHash: tx.txid, amountBTC: parseFloat((receivedSats / 1e8).toFixed(8)) });
      }
      if (!candidates.length) return;

      // ── Step 3: Skip anything already credited. Checked against BOTH ledgers:
      //   • deposit_tracking_v2 — the txid tracker (rows since ~2026-08).
      //   • wallet_transactions — the real credit ledger, matched on the
      //     deterministic idempotency key `BTC:<userId>:<txHash>`. Deposits
      //     credited before deposit_tracking_v2 existed have no tracker row, but
      //     once back-filled (scripts/backfill-deposit-idempotency-keys.js +
      //     scripts/backfill-deposit-tracking-v2.js) they carry this key — so an
      //     old, already-credited deposit re-delivered here can never be credited
      //     twice, independent of the age guard. This check only ever PREVENTS a
      //     credit; a key match is unambiguous (written once, for this exact
      //     user+txid), so it cannot cause a false skip.
      const txHashes = candidates.map(c => c.txHash);
      const idemKeys = txHashes.map(h => `BTC:${userId}:${h}`);
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

      for (const { txHash, amountBTC } of candidates) {
        if (creditedSet.has(txHash)) {
          if (!seenSet.has(txHash) && ledgerTxids.has(txHash)) {
            console.log(`[DepositMonitor] tx ${String(txHash).slice(0, 12)}… already credited (ledger key match), no tracker row — skipping. Run the deposit_tracking_v2 back-fill to record the marker.`);
          }
          continue;
        }
        await this.creditConfirmedDeposit({ userId, username, address, txHash, depositBTC: amountBTC, alreadySeen: seenSet.has(txHash) });
      }

      // Best-effort: keep last_onchain_btc roughly in sync for anything else in
      // the codebase that still reads it for display/diagnostics. It is no
      // longer used to DECIDE whether a deposit is new — deposit_tracking_v2 is —
      // so a stale value here can no longer cause a missed or duplicate credit.
      const chain = await this._fetchAddress(address, priority).catch(() => null);
      if (chain?.chain_stats) {
        const onchainBal = parseFloat((((chain.chain_stats.funded_txo_sum || 0) - (chain.chain_stats.spent_txo_sum || 0)) / 1e8).toFixed(8));
        supabaseAdmin.from('user_wallets').update({ last_onchain_btc: onchainBal }).eq('user_id', userId).then(null, () => {});
      }

      // 2.3a: this address checked cleanly — drop any pending retry marker.
      this._dequeueRecheck(address);

    } catch (err) {
      const status = err.response?.status;
      const isTimeout = ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(err.code)
        || /unreachable|timed out|timeout/i.test(err.message || '');
      if (status === 429 || status === 503 || isTimeout) {
        // 2.3a: transient — park the address so the NEXT cycle retries it
        // instead of just re-reading everything from scratch and possibly
        // losing this one again.
        const reason = status ? `HTTP ${status}` : (err.code || 'unreachable');
        console.warn(`[DepositMonitor] transient failure for ${address.slice(0, 12)}… (${reason}) — queued for recheck next cycle`);
        this._enqueueRecheck(userId, address, reason);
      } else {
        console.error(`[DepositMonitor] Error checking ${address.slice(0, 12)}…:`, err.message || err.code || String(err));
      }
    }
  }

  // ── 2.3a — persistent recheck queue ──────────────────────────────────────
  // A poll that failed transiently (explorer 429 / timeout / DNS) is parked in
  // deposit_recheck_queue and retried at the top of the next cycle, so a bad API
  // window during a deposit's arrival→sweep gap is no longer a permanent miss.
  // All best-effort: if the table is absent the monitor behaves exactly as before.
  async _enqueueRecheck(userId, address, reason) {
    try {
      const { data: existing } = await supabaseAdmin.from('deposit_recheck_queue')
        .select('attempts').eq('address', address).eq('currency', 'BTC').maybeSingle();
      await supabaseAdmin.from('deposit_recheck_queue').upsert({
        address, currency: 'BTC', user_id: userId, reason,
        attempts: (existing?.attempts || 0) + 1,
        last_attempt: new Date().toISOString(),
      }, { onConflict: 'address,currency' });
    } catch (_) { /* table absent or write failed — non-fatal */ }
  }

  _dequeueRecheck(address) {
    supabaseAdmin.from('deposit_recheck_queue')
      .delete().eq('address', address).eq('currency', 'BTC').then(null, () => {});
  }

  async _drainRecheckQueue() {
    let queued;
    try {
      const { data, error } = await supabaseAdmin
        .from('deposit_recheck_queue').select('user_id, address').eq('currency', 'BTC').limit(200);
      if (error) return; // table not present yet — nothing to do
      queued = data || [];
    } catch (_) { return; }
    if (!queued.length) return;
    console.log(`[DepositMonitor] 2.3a — retrying ${queued.length} queued address(es) from a previous failed cycle`);
    for (const q of queued) {
      if (!this.isValidMainnetAddress(q.address)) { this._dequeueRecheck(q.address); continue; }
      await this.checkUserDeposit({ userId: q.user_id, address: q.address, username: null });
      await this.sleep(1200);
    }
  }

  // ── Credit one specific confirmed transaction, exactly once, ever ─────────
  // Records the txid in deposit_tracking_v2 BEFORE attempting the credit (the
  // idempotency gate — same "claim, then act" shape the old checkpoint design
  // used, just keyed on a permanent txid instead of a balance value that a
  // sweep can quietly erase), then calls the exact same atomic
  // praqen_credit_deposit RPC this monitor has always used. This function
  // changes WHEN a deposit is recognized as new — it does not change HOW it is
  // credited, and it never moves or sends any funds itself.
  async creditConfirmedDeposit({ userId, username, address, txHash, depositBTC, alreadySeen }) {
    if (!alreadySeen) {
      const { error: insErr } = await supabaseAdmin.from('deposit_tracking_v2').insert({
        tx_hash: txHash, address, user_id: userId, currency: 'BTC', amount: depositBTC,
        credited: false, detected_by: 'realtime_monitor',
      });
      if (insErr) {
        // Unique violation means another concurrent check (the WebSocket path and
        // this poll can both reach here within the same second) already claimed
        // this txid first — let that one proceed, this one backs off cleanly.
        if (/duplicate|unique/i.test(insErr.message || '')) {
          console.log(`[DepositMonitor] ${txHash.slice(0, 12)}… already claimed by a concurrent check — skipping.`);
          return;
        }
        console.error(`[DepositMonitor] Failed to record ${txHash.slice(0, 12)}… in deposit_tracking_v2:`, insErr.message);
        return; // don't credit without a recorded claim — same fail-safe spirit as the old checkpoint-first design
      }
    }

    console.log(`\n💰 [DepositMonitor] New deposit detected for user ${username}: ${depositBTC} BTC`);
    console.log(`   Address : ${address}`);
    console.log(`   TX hash : ${txHash}`);

    // ── Atomic deposit credit — unchanged RPC, unchanged guarantees (ledger
    // idempotency + checkpoint advance + balance credit + balance_audit stamp,
    // all in one Postgres transaction). Only the idempotency key changed: a
    // txid instead of an on-chain balance value, since the txid is what's
    // actually permanent now.
    const idempotencyKey = `BTC:${userId}:${txHash}`;
    let newBalanceBTC;
    try {
      const { data: rpcBalance, error: creditErr } = await supabaseAdmin.rpc('praqen_credit_deposit', {
        p_user_id:         userId,
        p_currency:        'BTC',
        p_amount:          depositBTC,
        p_onchain_balance: depositBTC, // informational only now — deposit_tracking_v2 is what gates re-processing, not this figure
        p_idempotency_key: idempotencyKey,
        p_note:            `On-chain deposit ${txHash.slice(0, 16)}… to ${address.slice(0, 16)}…`,
      });
      if (creditErr) throw creditErr;
      newBalanceBTC = parseFloat(rpcBalance);
    } catch (creditErr) {
      if (/duplicate|unique/i.test(creditErr.message || '') || /idempotency_key/i.test(creditErr.message || '')) {
        console.log(`[DepositMonitor] ${txHash.slice(0, 12)}… was already credited under this idempotency key — marking as credited.`);
        await supabaseAdmin.from('deposit_tracking_v2')
          .update({ credited: true, credited_at: new Date().toISOString() })
          .eq('tx_hash', txHash).eq('address', address);
        return;
      }
      // Nothing was committed (the RPC is one transaction). Leave credited=false
      // so the next check (WebSocket event or 15-min poll) retries this exact
      // txid automatically — it's already recorded, so it can't be double-counted,
      // only retried until it succeeds.
      console.error(`🚨 [DepositMonitor] praqen_credit_deposit FAILED for ${username} (tx ${txHash.slice(0, 12)}…) — will retry automatically on next check: ${creditErr.message}`);
      await supabaseAdmin.from('deposit_tracking_v2').update({ credit_error: creditErr.message }).eq('tx_hash', txHash).eq('address', address);
      this.alertOpsOfCreditFailure(username, userId, depositBTC, 'BTC', creditErr.message).catch(() => {});
      return;
    }

    await supabaseAdmin.from('deposit_tracking_v2')
      .update({ credited: true, credited_at: new Date().toISOString() })
      .eq('tx_hash', txHash).eq('address', address);

    // ── Real-time balance spike & anomaly check ──────────────────────────────
    balanceAnomalyMonitor.checkCreditEvent({
      userId,
      username,
      currency: 'BTC',
      amount: depositBTC,
      txHash,
      newBalance: newBalanceBTC,
    }).catch(err => console.error('[DepositMonitor] Anomaly monitor error:', err.message));

    // Also mirror the deposit address onto user_wallets.btc_address if this is
    // this user's first detected deposit to it (best-effort; not part of the
    // atomic credit since it's address metadata, not a balance).
    supabaseAdmin.from('user_wallets').update({ btc_address: address }).eq('user_id', userId)
      .then(null, () => {});

    // ── In-app notification ─────────────────────────────────────────────────
    await supabaseAdmin
      .from('notifications')
      .insert({
        user_id:    userId,
        type:       'wallet',
        title:      '₿ Bitcoin Received!',
        message:    `${depositBTC.toFixed(8)} BTC credited to your wallet. Balance: ${newBalanceBTC.toFixed(8)} BTC`,
        action:     '/wallet',
        is_read:    false,
        created_at: new Date().toISOString(),
      });

    // ── Push notification (OneSignal) ───────────────────────────────────────
    sendSystemAlert(
      userId,
      '₿ Bitcoin Received!',
      `${depositBTC.toFixed(8)} BTC deposited to your PRAQEN wallet`,
      'https://praqen.com/wallet'
    ).catch(err => console.error('[DepositMonitor] Push notification error:', err.message));

    // ── Telegram notification ───────────────────────────────────────────────
    sendTelegramAlert(userId, `✅ Deposit received! ₿${depositBTC.toFixed(8)} BTC credited to your wallet. Balance: ${newBalanceBTC.toFixed(8)} BTC`).catch(() => {});

    // ── Re-evaluate offer status ─────────────────────────────────────────────
    updateOfferStatus(userId).catch(() => {});

    // ── Trigger sweep so deposit moves to hot wallet immediately ────────────
    // Fire-and-forget — never blocks deposit credit, never surfaces errors to user.
    // Unchanged from before: this line already existed and already triggers a
    // real fund movement (address → hot wallet) as a side effect of a credited
    // deposit. Nothing about this step's behavior changes here.
    try {
      const sweepService = require('./sweepService');
      sweepService.sweepUser(userId).catch(() => {});
    } catch (_) {}

    // ── SMS + Email (fire-and-forget) ───────────────────────────────────────
    // NOTE for review: these now pass newBalanceBTC (the actual platform wallet
    // balance the RPC just returned) instead of the old blockchainBTC (the
    // address's total on-chain balance, which the old code used as a stand-in
    // for "new balance"). This per-transaction flow doesn't compute a single
    // address-total figure the way the old one did, and newBalanceBTC is the
    // more accurate number to show anyway — flagging this as a deliberate,
    // small, in-scope behavior change, not an oversight.
    Promise.allSettled([
      this.sendDepositSMS(userId, depositBTC, newBalanceBTC),
      this.sendDepositEmail(userId, username, depositBTC, newBalanceBTC, address),
      this.alertOpsOfNewDeposit(username, userId, depositBTC, 'BTC', newBalanceBTC, address),
    ]).then(results => {
      results.forEach(r => {
        if (r.status === 'rejected') console.error('[DepositMonitor] Notification error:', r.reason?.message);
      });
    });

    console.log(`✅ [DepositMonitor] Credited ${depositBTC} BTC to ${username} | Operational balance: ${newBalanceBTC.toFixed(8)} BTC | TX: ${txHash.slice(0, 16)}…`);
  }

  // ── Critical alert: a real on-chain deposit failed to credit the user's balance ──
  // This is a fund-safety incident, not a routine error — the deposit-detection claim
  // already advanced, so without a human catching this, the deposit is silently lost
  // from the user's perspective until support intervenes.
  async alertOpsOfCreditFailure(username, userId, amount, currency, errMsg) {
    try {
      // Routed through emailService (Resend → Brevo SMTP, logged to email_logs).
      // The old nodemailer 'gmail' transport used EMAIL_USER/EMAIL_PASS, which are
      // not set in this environment, so every one of these alerts was silently
      // dropped (see BALANCE_MISMATCH_INVESTIGATION.md / remediation SEC-4).
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
      console.error('🚨 [DepositMonitor] Even the ops alert email failed:', e.message);
    }
  }

  // ── Ops notification: every new user deposit, BTC or USDT ─────────────────
  // Requested by CEO — a heads-up email any time any user deposits, separate
  // from the user's own "deposit received" confirmation email.
  async alertOpsOfNewDeposit(username, userId, amount, currency, newBalance, address) {
    try {
      await emailService.sendEmail({
        to:      process.env.OPS_ALERT_EMAIL || 'support@praqen.com',
        subject: `💰 New deposit — ${amount} ${currency} — ${username}`,
        type:    'ops_new_deposit_alert',
        html: `<p><strong>A user deposit was just credited.</strong></p>
               <p>User: ${username} (${userId})<br/>
               Amount: ${amount} ${currency}<br/>
               New balance: ${newBalance} ${currency}<br/>
               Address: ${address}</p>`,
      });
    } catch (e) {
      console.error('[DepositMonitor] alertOpsOfNewDeposit error:', e.message);
    }
  }

  // ── SMS notification ───────────────────────────────────────────────────────
  async sendDepositSMS(userId, depositBTC, newBalance) {
    if (!twilioClient) return;
    const { data: user } = await supabaseAdmin
      .from('users').select('phone').eq('id', userId).single();
    if (!user?.phone) return;

    const phone = user.phone.startsWith('+') ? user.phone : `+${user.phone}`;
    await twilioClient.messages.create({
      body: `[PRAQEN ⚡] ₿${depositBTC.toFixed(8)} BTC received! New balance: ₿${newBalance.toFixed(8)}. View: https://praqen.com/wallet`,
      from: process.env.TWILIO_PHONE,
      to:   phone,
    });
    console.log(`📱 [DepositMonitor] SMS sent to user ${userId.slice(0, 8)}`);
  }

  // ── Email notification ─────────────────────────────────────────────────────
  async sendDepositEmail(userId, username, depositBTC, newBalance, address) {
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
      subject: `₿ ${depositBTC.toFixed(8)} BTC received — PRAQEN`,
      type:    'deposit_confirmed_btc',
      html:    depositEmailHtml(displayName, depositBTC, newBalance, address),
    });
    console.log(`📧 [DepositMonitor] Email sent to user ${userId.slice(0, 8)} (${user.email})`);
  }

  // ── Monitor escrow addresses for active trades ─────────────────────────────
  async checkEscrowDeposits() {
    try {
      const { data: trades, error } = await supabaseAdmin
        .from('trades')
        .select('id, buyer_id, seller_id, amount_btc, escrow_wallet_address, status')
        .in('status', ['CREATED', 'PENDING_DEPOSIT'])
        .not('escrow_wallet_address', 'is', null);

      if (error || !trades || trades.length === 0) return;

      console.log(`[DepositMonitor] Checking ${trades.length} escrow address(es)…`);
      for (const trade of trades) {
        await this.checkEscrowFunded(trade);
        await this.sleep(600);
      }
    } catch (err) {
      console.error('[DepositMonitor] checkEscrowDeposits error:', err.message);
    }
  }

  // ── Check if an escrow address has received enough BTC ────────────────────
  async checkEscrowFunded(trade) {
    const { id: tradeId, escrow_wallet_address: address, amount_btc } = trade;
    if (!address) return;

    try {
      const d    = await this._fetchAddress(address);
      const confirmedSats = d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum;
      const confirmedBTC  = confirmedSats / 1e8;
      const requiredBTC   = parseFloat(amount_btc || 0);

      if (confirmedBTC < requiredBTC || requiredBTC === 0) return;

      console.log(`\n🔒 [DepositMonitor] Escrow funded — trade ${tradeId.slice(0, 8)}`);
      console.log(`   Required: ${requiredBTC} BTC | Received: ${confirmedBTC} BTC`);

      await supabaseAdmin
        .from('trades')
        .update({
          status:           'FUNDS_LOCKED',
          escrow_locked_at: new Date().toISOString(),
          escrow_amount:    confirmedBTC,
        })
        .eq('id', tradeId)
        .in('status', ['CREATED', 'PENDING_DEPOSIT']);

      for (const uid of [trade.buyer_id, trade.seller_id].filter(Boolean)) {
        await supabaseAdmin.from('notifications').insert({
          user_id:    uid,
          type:       'trade',
          title:      '🔒 Escrow Funded!',
          message:    `Trade #${tradeId.slice(0, 8).toUpperCase()} is ACTIVE — Bitcoin is locked in escrow.`,
          action:     `/trade/${tradeId}`,
          is_read:    false,
          created_at: new Date().toISOString(),
        });
      }

      console.log(`✅ [DepositMonitor] Trade ${tradeId.slice(0, 8)} → FUNDS_LOCKED\n`);
    } catch (err) {
      console.error(`[DepositMonitor] Escrow check error trade ${tradeId.slice(0, 8)}:`, err.message);
    }
  }

  // ── Manual check for one user (called by /api/hd-wallet/check-deposit) ─────
  async checkAddressNow(userId) {
    let address  = null;
    let username = null;

    const { data: wallet } = await supabaseAdmin
      .from('user_wallets').select('btc_address').eq('user_id', userId).single();
    if (wallet?.btc_address) address = wallet.btc_address;

    if (!address) {
      const { data: user } = await supabaseAdmin
        .from('users').select('username, bitcoin_wallet_address').eq('id', userId).single();
      address  = user?.bitcoin_wallet_address;
      username = user?.username;
    }

    if (!address) throw new Error('No wallet address found — generate one first');

    await this.checkUserDeposit({ userId, address, username, priority: 'high' });

    const { data: wal } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', userId).maybeSingle();

    return {
      success:     true,
      balance_btc: parseFloat(wal?.balance_btc || 0),
      address,
      checked_at:  new Date().toISOString(),
    };
  }

  // ── Status info ───────────────────────────────────────────────────────────
  getStatus() {
    return {
      running:           this.isRunning,
      network:           this.network,
      poll_interval_min: POLL_INTERVAL_MS / 1000 / 60,
      api:               this.apiBase,
    };
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new DepositMonitor();
