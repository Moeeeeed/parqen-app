// services/realtimeDepositService.js
// PRAQEN — Real-Time Bitcoin Deposit Detection via mempool.space WebSocket
//
// How it works:
//   1. Opens ONE persistent WebSocket to wss://mempool.space/api/v1/ws
//   2. Subscribes to ALL user wallet addresses with {"track-addresses": [...]}
//   3. mempool.space fires events the INSTANT a tx touches any subscribed address
//   4. On UNCONFIRMED:  notify user "Bitcoin incoming — waiting for confirmation"
//   5. On CONFIRMED:    immediately call depositMonitor.checkAddressNow(userId)
//                       which credits the balance and sends full notifications
//   6. Auto-reconnects with exponential backoff on disconnect
//   7. 5-minute scanner in depositMonitor.js remains as safety net
//
// Latency comparison:
//   Before: up to 5 minutes (polling interval)
//   After:  1-3 seconds after transaction enters mempool
//           + instant credit once block confirms

require('dotenv').config();
const { WebSocket }    = require('ws');
const { createClient } = require('@supabase/supabase-js');
const depositMonitor   = require('./depositMonitor');
const { sendSystemAlert } = require('./pushNotificationService');
const { sendTelegramAlert } = require('./telegramService');
const { isDepositTooOld, MAX_DEPOSIT_AGE_HOURS } = require('./depositAgeGuard'); // containment guard, see depositAgeGuard.js

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const MEMPOOL_WS_URL       = 'wss://mempool.space/api/v1/ws';
const RECONNECT_BASE_MS    = 5_000;
const RECONNECT_MAX_MS     = 120_000;  // cap at 2 minutes
const PING_INTERVAL_MS     = 30_000;   // keepalive ping every 30s
const PENDING_TTL_MS       = 2 * 60 * 60 * 1000; // dedupe window: 2 hours

class RealtimeDepositService {
  constructor() {
    this.ws             = null;
    this.addressToUser  = new Map();  // btcAddress -> userId
    this.reconnectDelay = RECONNECT_BASE_MS;
    this.isRunning      = false;
    this.pingTimer      = null;
    this.pendingTxs     = new Set();  // "txid:userId" — prevents duplicate pending alerts
    this.confirmedTxs   = new Set();  // "txid:userId" — prevents the same confirmed tx re-triggering a credit check
    this._dedupeCleanupTimer = null;
  }

  // ── Step 2.3c — persist the dedupe sets so a restart / reconnect cannot
  // replay historic confirmed txs as new. In-memory Sets stay the fast path;
  // this table is the restart-survival backup. Best-effort throughout: if the
  // table doesn't exist yet or a write fails, the service still works exactly as
  // before (the Set + the age guard in processTx still apply).
  async _loadPersistedDedupe() {
    try {
      const cutoff = new Date(Date.now() - PENDING_TTL_MS).toISOString();
      const { data, error } = await supabaseAdmin
        .from('realtime_tx_dedupe').select('dedupe_key, kind').gt('created_at', cutoff);
      if (error) { console.warn('[RealtimeDeposit] dedupe table not available — running in-memory only:', error.message); return; }
      for (const r of (data || [])) {
        if (r.kind === 'confirmed') this.confirmedTxs.add(r.dedupe_key);
        else this.pendingTxs.add(r.dedupe_key);
      }
      console.log(`[RealtimeDeposit] restored ${data ? data.length : 0} dedupe key(s) from realtime_tx_dedupe`);
    } catch (e) {
      console.warn('[RealtimeDeposit] _loadPersistedDedupe failed (non-fatal):', e.message);
    }
  }

  _persistDedupe(key, kind) {
    supabaseAdmin.from('realtime_tx_dedupe').insert({ dedupe_key: key, kind }).then(null, () => {}); // unique PK => idempotent
  }

  _startDedupeCleanup() {
    if (this._dedupeCleanupTimer) return;
    const sweep = () => {
      const cutoff = new Date(Date.now() - PENDING_TTL_MS).toISOString();
      supabaseAdmin.from('realtime_tx_dedupe').delete().lt('created_at', cutoff).then(null, () => {});
    };
    this._dedupeCleanupTimer = setInterval(sweep, 60 * 60 * 1000); // hourly
  }

  // ── Public: start the service ─────────────────────────────────────────────
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    await this.loadAllAddresses();
    await this._loadPersistedDedupe();
    this._startDedupeCleanup();
    this.connect();

    console.log(`\n⚡ [RealtimeDeposit] Service started`);
    console.log(`   Monitoring ${this.addressToUser.size} address(es) via mempool.space WebSocket`);
    console.log(`   Confirmed deposits will credit user wallets INSTANTLY\n`);
  }

  // ── Public: subscribe a newly created wallet address ─────────────────────
  // Call this after generating a new address for a user
  subscribeAddress(userId, address) {
    if (!address || !userId) return;
    if (this.addressToUser.has(address)) return; // already tracked

    this.addressToUser.set(address, userId);
    console.log(`[RealtimeDeposit] + Subscribed new address ${address.slice(0, 14)}… for user ${userId.slice(0, 8)}`);

    // Push updated subscription to the open WebSocket immediately
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription();
    }
  }

  // ── Load all existing wallet addresses from DB ────────────────────────────
  async loadAllAddresses() {
    try {
      const [{ data: wallets }, { data: users }] = await Promise.all([
        supabaseAdmin.from('user_wallets').select('user_id, btc_address')
          .not('btc_address', 'is', null).neq('btc_address', ''),
        supabaseAdmin.from('users').select('id, bitcoin_wallet_address')
          .not('bitcoin_wallet_address', 'is', null).neq('bitcoin_wallet_address', ''),
      ]);

      for (const w of (wallets || [])) {
        if (w.btc_address) this.addressToUser.set(w.btc_address, w.user_id);
      }
      for (const u of (users || [])) {
        if (u.bitcoin_wallet_address && !this.addressToUser.has(u.bitcoin_wallet_address)) {
          this.addressToUser.set(u.bitcoin_wallet_address, u.id);
        }
      }
    } catch (err) {
      console.error('[RealtimeDeposit] loadAllAddresses error:', err.message);
    }
  }

  // ── Open WebSocket connection ─────────────────────────────────────────────
  connect() {
    try {
      this.ws = new WebSocket(MEMPOOL_WS_URL);
    } catch (err) {
      console.error('[RealtimeDeposit] WebSocket constructor error:', err.message);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      console.log('[RealtimeDeposit] Connected to mempool.space WebSocket');
      this.reconnectDelay = RECONNECT_BASE_MS; // reset backoff on successful connect

      // Request initial connection data
      this.wsSend({ action: 'init' });

      // Subscribe to all addresses
      this.sendSubscription();

      // Start keepalive pings so the connection doesn't time out
      this.startPing();
    });

    this.ws.on('message', (raw) => {
      try {
        this.handleMessage(JSON.parse(raw.toString()));
      } catch { /* ignore malformed frames */ }
    });

    this.ws.on('close', (code, reason) => {
      this.stopPing();
      console.warn(`[RealtimeDeposit] Disconnected (code ${code}) — reconnecting in ${this.reconnectDelay / 1000}s`);
      if (this.isRunning) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      // 'error' always fires before 'close', so just log — reconnect happens in close handler
      console.error('[RealtimeDeposit] WebSocket error:', err.message || err.code || String(err));
    });
  }

  // ── Send subscription for all monitored addresses ────────────────────────
  sendSubscription() {
    const addresses = [...this.addressToUser.keys()];
    if (addresses.length === 0) {
      console.log('[RealtimeDeposit] No addresses to subscribe yet');
      return;
    }
    // mempool.space supports subscribing to multiple addresses in one message
    this.wsSend({ 'track-addresses': addresses });
    console.log(`[RealtimeDeposit] Subscribed to ${addresses.length} address(es)`);
  }

  // ── Handle incoming WebSocket messages ───────────────────────────────────
  handleMessage(msg) {
    // Multi-address subscription events (from track-addresses)
    if (msg['multi-address-transactions']) {
      const mat = msg['multi-address-transactions'];
      // Newly confirmed transactions
      for (const tx of (mat.confirmed || [])) {
        this.processTx(tx, true);
      }
      // New unconfirmed (mempool) transactions
      for (const tx of (mat['mempool-transactions'] || [])) {
        this.processTx(tx, false);
      }
    }

    // Single-address subscription events (from track-address — kept for compatibility)
    if (msg['address-transactions']) {
      for (const tx of msg['address-transactions']) {
        const isConfirmed = tx.status?.confirmed === true;
        this.processTx(tx, isConfirmed);
      }
    }

    // Block confirmed — mempool.space sends this when a block is found
    // Contains all newly-confirmed transactions (used with track-addresses)
    if (msg['block-transactions']?.added) {
      for (const tx of msg['block-transactions'].added) {
        this.processTx(tx, true);
      }
    }
  }

  // ── Process one transaction ───────────────────────────────────────────────
  async processTx(tx, isConfirmed) {
    if (!tx?.vout) return;

    // CONTAINMENT GUARD (2026-09-03): on reconnect, the WebSocket can replay
    // historic confirmed transactions for a subscribed address. checkAddressNow()
    // then re-scans the whole address history — one of the ways old, already-
    // credited deposits got credited a second time. Ignore any confirmed tx whose
    // block time is older than MAX_DEPOSIT_AGE_HOURS; a real new deposit is always
    // recent here. (depositMonitor.checkUserDeposit carries the same guard as a
    // second line of defence.) Unconfirmed (mempool) events are never affected.
    if (isConfirmed && isDepositTooOld(tx.status?.block_time)) {
      console.warn(`[RealtimeDeposit] ⏸  Ignoring confirmed tx ${String(tx.txid || '').slice(0, 12)}… — block time ${MAX_DEPOSIT_AGE_HOURS}h+ ago (containment guard against re-crediting historic deposits).`);
      return;
    }

    for (const vout of tx.vout) {
      const addr   = vout.scriptpubkey_address;
      if (!addr) continue;

      const userId = this.addressToUser.get(addr);
      if (!userId) continue;

      const amountSats = vout.value || 0;
      const amountBTC  = parseFloat((amountSats / 1e8).toFixed(8));
      const txid       = tx.txid || 'unknown';

      if (isConfirmed) {
        // ── CONFIRMED: credit balance immediately ─────────────────────────
        // mempool.space can and does deliver the SAME confirmed tx twice in one
        // session — once via multi-address-transactions.confirmed, again via
        // block-transactions.added for the same block — moments apart. That
        // double-triggered checkAddressNow() with duplicate DEPOSIT log rows
        // (hidil55555, twice: 2026-08-23 and 2026-08-24 — depositMonitor's own
        // balance-credit guard held both times, but the log was never deduped
        // at the source). Dedupe by txid+userId here, same pattern already used
        // for the unconfirmed alert below, so a repeat delivery never reaches
        // checkAddressNow at all.
        const confirmedKey = `${txid}:${userId}`;
        if (this.confirmedTxs.has(confirmedKey)) continue;
        this.confirmedTxs.add(confirmedKey);
        this._persistDedupe(confirmedKey, 'confirmed'); // survives a restart (2.3c)
        setTimeout(() => this.confirmedTxs.delete(confirmedKey), PENDING_TTL_MS);

        console.log(`\n⚡ [RealtimeDeposit] CONFIRMED ${amountBTC} BTC for user ${userId.slice(0, 8)}`);
        console.log(`   Address: ${addr.slice(0, 16)}… | TxID: ${txid.slice(0, 12)}…`);

        try {
          const result = await depositMonitor.checkAddressNow(userId);
          console.log(`✅ [RealtimeDeposit] Balance credited: ${result.balance_btc} BTC for user ${userId.slice(0, 8)}\n`);
        } catch (err) {
          console.error(`[RealtimeDeposit] checkAddressNow failed for ${userId.slice(0, 8)}:`, err.message);
        }

      } else {
        // ── UNCONFIRMED (mempool): alert user, do NOT credit yet ──────────
        // Deduplicate: only send one "incoming" alert per txid+user combo
        const dedupeKey = `${txid}:${userId}`;
        if (this.pendingTxs.has(dedupeKey)) continue;
        this.pendingTxs.add(dedupeKey);
        this._persistDedupe(dedupeKey, 'pending'); // survives a restart (2.3c)
        setTimeout(() => this.pendingTxs.delete(dedupeKey), PENDING_TTL_MS);

        console.log(`\n⏳ [RealtimeDeposit] UNCONFIRMED ${amountBTC} BTC for user ${userId.slice(0, 8)}`);
        console.log(`   Address: ${addr.slice(0, 16)}… | TxID: ${txid.slice(0, 12)}…`);

        // In-app notification
        supabaseAdmin.from('notifications').insert({
          user_id:    userId,
          type:       'wallet',
          title:      '⏳ Bitcoin Incoming!',
          message:    `${amountBTC.toFixed(8)} BTC detected on the blockchain — waiting for 1 confirmation. Your balance will update automatically.`,
          action:     '/wallet',
          is_read:    false,
          created_at: new Date().toISOString(),
        }).catch(err => console.error('[RealtimeDeposit] Pending notification error:', err.message));

        // Push notification
        sendSystemAlert(
          userId,
          '⏳ Bitcoin Incoming!',
          `${amountBTC.toFixed(8)} BTC detected — confirming on blockchain. Balance updates when confirmed.`,
          'https://praqen.com/wallet'
        ).catch(err => console.error('[RealtimeDeposit] Pending push error:', err.message));

        // Telegram notification
        sendTelegramAlert(userId, `⏳ Bitcoin incoming! ₿${amountBTC.toFixed(8)} BTC detected — confirming on blockchain.`).catch(() => {});
      }
    }
  }

  // ── Keepalive: ping every 30s so connection doesn't time out ─────────────
  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.wsSend({ action: 'ping' });
      }
    }, PING_INTERVAL_MS);
  }

  stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  // ── Schedule a reconnection with exponential backoff ─────────────────────
  scheduleReconnect() {
    setTimeout(() => {
      if (this.isRunning) {
        console.log('[RealtimeDeposit] Reconnecting...');
        this.connect();
      }
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  // ── Safe WebSocket send ───────────────────────────────────────────────────
  wsSend(obj) {
    try {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(obj));
      }
    } catch (err) {
      console.error('[RealtimeDeposit] wsSend error:', err.message);
    }
  }

  stop() {
    this.isRunning = false;
    this.stopPing();
    if (this._dedupeCleanupTimer) { clearInterval(this._dedupeCleanupTimer); this._dedupeCleanupTimer = null; }
    this.ws?.terminate();
    this.ws = null;
    console.log('[RealtimeDeposit] Stopped');
  }

  getStatus() {
    return {
      connected:         this.ws?.readyState === WebSocket.OPEN,
      monitored_wallets: this.addressToUser.size,
      reconnect_delay_s: this.reconnectDelay / 1000,
    };
  }
}

module.exports = new RealtimeDepositService();
