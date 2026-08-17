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
const nodemailer = require('nodemailer');
const { updateOfferStatus }  = require('./offerStatusService');
const { sendSystemAlert }    = require('./pushNotificationService');
const { createClient }       = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS    = 15 * 60 * 1000; // 15 minutes — WebSocket handles real-time; this is safety net only
const DUST_THRESHOLD_SATS = 546;           // ignore sub-dust outputs

// ── Email transporter (Gmail) ─────────────────────────────────────────────────
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
    this.isRunning  = false;
    this.intervalId = null;
    this.network    = null;
    this.apiBase    = null;
    // Fallback APIs tried in order when primary times out
    this._apiFallbacks = [
      'https://mempool.space/api',
      'https://blockstream.info/api',
    ];
  }

  // ── Fetch address data with automatic fallback ────────────────────────────
  async _fetchAddress(address) {
    let lastErr;
    for (const api of this._apiFallbacks) {
      try {
        const resp = await axios.get(`${api}/address/${address}`, { timeout: 14000 });
        if (this.apiBase !== api) {
          console.log(`[DepositMonitor] Using API: ${api}`);
          this.apiBase = api; // switch primary to the one that's working
        }
        return resp.data;
      } catch (err) {
        lastErr = err;
        // No HTTP response at all — timeout (including axios's own ECONNABORTED
        // client-side timeout, previously missed by an error-code allowlist here),
        // DNS failure, connection refused/reset — means we never reached this API,
        // so always worth rotating to the next fallback. A genuine HTTP error
        // response (4xx/5xx) means the API IS reachable but rejected the request,
        // which trying a different API won't fix.
        if (err.response) throw err;
        // rotate: put the failed API at the back so the next one is tried first
        this._apiFallbacks.push(this._apiFallbacks.shift());
      }
    }
    throw lastErr;
  }

  // ── Start background polling ───────────────────────────────────────────────
  start() {
    if (this.isRunning) {
      console.log('[DepositMonitor] Already running — skipping duplicate start');
      return;
    }

    this.network = 'mainnet';
    this.apiBase = 'https://mempool.space/api';

    console.log(`\n🔍 DepositMonitor started — MAINNET`);
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
    const start = Date.now();
    console.log(`\n[DepositMonitor] ⏱  Cycle start ${new Date().toISOString()}`);
    await Promise.allSettled([
      this.checkAllUserDeposits(),
      this.checkEscrowDeposits(),
    ]);
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

      const BATCH = 5;
      for (let i = 0; i < valid.length; i += BATCH) {
        const batch = valid.slice(i, i + BATCH);
        await Promise.allSettled(batch.map(entry => this.checkUserDeposit(entry)));
        if (i + BATCH < valid.length) await this.sleep(1000); // 1s between batches
      }

    } catch (err) {
      console.error('[DepositMonitor] checkAllUserDeposits error:', err.message);
    }
  }

  // ── Validate mainnet address ───────────────────────────────────────────────
  isValidMainnetAddress(address) {
    if (!address || typeof address !== 'string') return false;
    if (/^bc1[a-z0-9]{25,87}$/.test(address)) return true;           // Native SegWit
    if (/^[13][a-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) return true; // Legacy / P2SH
    return false;
  }

  // ── Check one address for new deposits (balance comparison) ───────────────
  async checkUserDeposit({ userId, address, username, lastOnchainBtc: prefetchedOnchain }) {
    try {
      // Resolve username if not provided (fallback for manual checkAddressNow path)
      if (!username) {
        const { data: u } = await supabaseAdmin
          .from('users').select('username').eq('id', userId).single();
        username = u?.username || userId.slice(0, 8);
      }

      // ── Step 1: Fetch on-chain confirmed balance (mempool.space → blockstream fallback) ──
      const addrData      = await this._fetchAddress(address);
      const chainStats    = addrData?.chain_stats || {};
      const blockchainSats = (chainStats.funded_txo_sum || 0) - (chainStats.spent_txo_sum || 0);
      const blockchainBTC  = parseFloat((blockchainSats / 1e8).toFixed(8));

      // ── Step 2: Get last KNOWN on-chain balance ──────────────────────────
      // CRITICAL: We compare against last_onchain_btc, NOT balance_btc.
      // balance_btc goes up/down with internal escrow operations (locks, releases,
      // refunds) — those are off-chain and must never be used as a deposit baseline.
      // last_onchain_btc only ever increases when real Bitcoin arrives on-chain.
      // Use pre-fetched value from batch query when available; fall back to DB for manual checks.
      let lastOnchainBTC;
      if (prefetchedOnchain !== undefined) {
        lastOnchainBTC = prefetchedOnchain;
      } else {
        // Try user_wallets first; fall back to wallet_transactions DEPOSIT sum when column is missing
        const { data: walletRow, error: rowErr } = await supabaseAdmin
          .from('user_wallets')
          .select('last_onchain_btc')
          .eq('user_id', userId)
          .maybeSingle();
        if (rowErr || walletRow?.last_onchain_btc == null) {
          const { data: dtxs } = await supabaseAdmin
            .from('wallet_transactions')
            .select('amount_btc')
            .eq('user_id', userId)
            .eq('type', 'DEPOSIT');
          lastOnchainBTC = parseFloat(
            ((dtxs || []).reduce((s, t) => s + parseFloat(t.amount_btc || 0), 0)).toFixed(8)
          );
          if (rowErr) console.warn(`[DepositMonitor] last_onchain_btc unavailable for ${userId.slice(0,8)} — using wallet_transactions sum: ${lastOnchainBTC} BTC`);
        } else {
          lastOnchainBTC = parseFloat(walletRow.last_onchain_btc || 0);
        }
      }

      // ── Step 3: Compare on-chain vs last known on-chain ──────────────────
      // Use small epsilon (1 satoshi) to avoid floating-point false positives
      if (blockchainBTC <= lastOnchainBTC + 0.000000009) return;

      const depositBTC = parseFloat((blockchainBTC - lastOnchainBTC).toFixed(8));
      if (depositBTC * 1e8 <= DUST_THRESHOLD_SATS) return; // ignore dust

      console.log(`\n💰 [DepositMonitor] New deposit detected for user ${username}: ${depositBTC} BTC`);
      console.log(`   Address        : ${address}`);
      console.log(`   Blockchain now : ${blockchainBTC} BTC | Last on-chain: ${lastOnchainBTC} BTC`);

      // ── Step 4: Fetch current balance from wallets (single source of truth) ─
      const { data: walRow } = await supabaseAdmin
        .from('wallets')
        .select('balance_btc')
        .eq('user_id', userId)
        .maybeSingle();

      // ── Step 4b: Fetch BTC/USD price ──────────────────────────────────────
      let btcUsd = 0;
      try {
        const pr = await axios.get(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
          { timeout: 5000 }
        );
        btcUsd = parseFloat(pr.data?.bitcoin?.usd || 0);
      } catch {
        try {
          const pr2 = await axios.get('https://api.coinbase.com/v2/prices/BTC-USD/spot', { timeout: 5000 });
          btcUsd = parseFloat(pr2.data?.data?.amount || 0);
        } catch { /* price fetch failed — balance_usd will be 0 for this deposit */ }
      }

      const depositUsd        = btcUsd > 0 ? parseFloat((depositBTC * btcUsd).toFixed(2)) : 0;
      const currentBalanceBTC = parseFloat(walRow?.balance_btc || 0);
      const newBalanceBTC     = parseFloat((currentBalanceBTC + depositBTC).toFixed(8));

      // ── Step 5a: Atomically claim this deposit (compare-and-swap on last_onchain_btc) ──
      // The upsert this replaced always wrote unconditionally, regardless of what the row
      // currently held — but blockchainBTC was read (Step 1) and this claim happens several
      // `await`s later (a DB read, an external price-API call), and the realtime WebSocket
      // handler + the 15-minute poller legitimately can both fire for the same address in
      // that window. Two concurrent invocations reading the same stale last_onchain_btc would
      // both compute the same deposit delta and both credit the wallet for it — a real double
      // -credit, not a hypothetical one. Guard against it in the WHERE clause itself (checked
      // against the DB's current value, not our possibly-stale local one) instead of relying on
      // a local read: only claim if the stored balance hasn't already caught up to what we're
      // about to record. If another invocation already won, this matches zero rows and we abort
      // before crediting anything.
      const nowIso = new Date().toISOString();
      const { data: claimedRows, error: claimUpdErr } = await supabaseAdmin
        .from('user_wallets')
        .update({ last_onchain_btc: blockchainBTC, btc_address: address, updated_at: nowIso })
        .eq('user_id', userId)
        .or(`last_onchain_btc.is.null,last_onchain_btc.lt.${blockchainBTC}`)
        .select('user_id');

      let claimed = !claimUpdErr && claimedRows && claimedRows.length > 0;

      if (!claimed && !claimUpdErr) {
        // No row matched the WHERE clause — either this user has no user_wallets row yet, or
        // a concurrent invocation already claimed it. Try an insert: a real row already
        // existing means the unique constraint on user_id rejects it (race lost — correctly
        // do NOT credit); no row existing means this insert IS the atomic claim.
        const { error: insErr } = await supabaseAdmin
          .from('user_wallets')
          .insert({ user_id: userId, btc_address: address, last_onchain_btc: blockchainBTC, updated_at: nowIso });
        claimed = !insErr;
        if (insErr && !/duplicate|unique|already exists/i.test(insErr.message || '')) {
          console.warn(`[DepositMonitor] last_onchain_btc insert-claim failed for ${username}:`, insErr.message);
        }
      }

      if (claimUpdErr) {
        // A genuine query/schema error (not a race loss) — fall back to crediting without the
        // atomic guard rather than silently dropping a real deposit, matching prior behavior
        // for this specific failure mode.
        console.warn(`[DepositMonitor] last_onchain_btc claim query failed for ${username} — crediting without atomic guard:`, claimUpdErr.message);
        claimed = true;
      }

      if (!claimed) {
        console.log(`[DepositMonitor] Deposit for ${username} (${depositBTC} BTC) already claimed by a concurrent check — skipping duplicate credit`);
        return;
      }

      // ── Step 5b: Credit wallets table FIRST (single source of truth) ────────
      // wallets is the authoritative balance table read by escrow, HD wallet routes,
      // and all balance checks. This must succeed before anything else.
      const walletCreditErr = walRow
        ? (await supabaseAdmin.from('wallets')
            .update({ balance_btc: newBalanceBTC, updated_at: new Date().toISOString() })
            .eq('user_id', userId)).error
        : (await supabaseAdmin.from('wallets').insert({
            user_id:            userId,
            address:            address,
            balance_btc:        depositBTC,
            locked_balance_btc: 0,
            updated_at:         new Date().toISOString(),
          })).error;

      if (walletCreditErr) {
        console.error(`[DepositMonitor] wallets credit failed for ${username}:`, walletCreditErr.message);
        return;
      }

      // ── Step 5b2: Record in wallet_transactions — REQUIRED for idempotency when last_onchain_btc column is absent ──
      const { error: txInsertErr } = await supabaseAdmin
        .from('wallet_transactions')
        .insert({
          user_id:    userId,
          type:       'DEPOSIT',
          amount_btc: depositBTC,
          status:     'CONFIRMED',
          notes:      `On-chain deposit to ${address.slice(0, 16)}…`,
          created_at: new Date().toISOString(),
        });
      if (txInsertErr) console.warn(`[DepositMonitor] wallet_transactions insert failed for ${username}:`, txInsertErr.message);

      // ── Step 5c: Keep user_balances + user_wallets in sync (secondary) ──────
      // These tables are kept up-to-date for backwards compatibility only.
      // The praqen_credit_balance RPC handles both atomically.
      await supabaseAdmin.rpc('praqen_credit_balance', {
        p_user_id: userId,
        p_btc:     depositBTC,
        p_usd:     depositUsd,
        p_type:    'DEPOSIT',
        p_notes:   `On-chain deposit to ${address.slice(0, 16)}…`,
      }).then(({ error }) => {
        if (error) console.warn(`[DepositMonitor] Secondary RPC sync failed for ${username} (funds already credited to wallets):`, error.message);
      });

      // ── Step 8: In-app notification ───────────────────────────────────────
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

      // ── Step 9: Push notification (OneSignal) ─────────────────────────────
      sendSystemAlert(
        userId,
        '₿ Bitcoin Received!',
        `${depositBTC.toFixed(8)} BTC deposited to your PRAQEN wallet`,
        'https://praqen.com/wallet'
      ).catch(err => console.error('[DepositMonitor] Push notification error:', err.message));

      // ── Step 10: Re-evaluate offer status ────────────────────────────────
      updateOfferStatus(userId).catch(() => {});

      // ── Step 10b: Trigger sweep so deposit moves to hot wallet immediately ──
      // Fire-and-forget — never blocks deposit credit, never surfaces errors to user
      try {
        const sweepService = require('./sweepService');
        sweepService.sweepUser(userId).catch(() => {});
      } catch (_) {}

      // ── Step 11: SMS + Email (fire-and-forget) ────────────────────────────
      Promise.allSettled([
        this.sendDepositSMS(userId, depositBTC, blockchainBTC),
        this.sendDepositEmail(userId, username, depositBTC, blockchainBTC, address),
      ]).then(results => {
        results.forEach(r => {
          if (r.status === 'rejected') console.error('[DepositMonitor] Notification error:', r.reason?.message);
        });
      });

      console.log(`✅ [DepositMonitor] Credited ${depositBTC} BTC to ${username} | Operational balance: ${newBalanceBTC.toFixed(8)} BTC | On-chain: ${blockchainBTC.toFixed(8)} BTC`);

    } catch (err) {
      if (err.response?.status === 429) {
        console.warn(`[DepositMonitor] Rate limited — will retry next cycle`);
      } else {
        const isTimeout = ['ETIMEDOUT','ECONNREFUSED','ENOTFOUND','ECONNRESET'].includes(err.code);
        if (isTimeout) {
          console.warn(`[DepositMonitor] All APIs unreachable for ${address.slice(0, 12)}… — will retry next cycle`);
        } else {
          console.error(`[DepositMonitor] Error checking ${address.slice(0, 12)}…:`, err.message || err.code || String(err));
        }
      }
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
    await emailTransporter.sendMail({
      from:    '"PRAQEN" <support@praqen.com>',
      to:      user.email,
      subject: `₿ ${depositBTC.toFixed(8)} BTC received — PRAQEN`,
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

    await this.checkUserDeposit({ userId, address, username });

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
