// services/depositReconciliationService.js
// PRAQEN — Deposit Reconciliation Safety Net (Phase A: READ-ONLY DETECTION)
//
// Runs hourly. For every user's BTC and USDT deposit address, pulls the same
// on-chain transaction/transfer history the real-time monitors already use
// (reusing their own fetch methods, so this can never disagree with them about
// what a "confirmed incoming payment" looks like), and checks each one
// against two places:
//   1. deposit_tracking_v2 — the new txid ledger (see database migration
//      20260827_deposit_tracking_by_txhash.sql and depositMonitor.js /
//      usdtDepositMonitor.js, both already updated to write to it).
//   2. wallet_transactions — the real historical credit ledger, which also
//      holds deposits credited before deposit_tracking_v2 existed, or via a
//      one-off manual correction script (like the ukbuyer2022 fix) that never
//      wrote to deposit_tracking_v2 but IS a legitimate, already-applied credit.
// Anything found on-chain that is NOT accounted for in EITHER place gets a row
// written to reconciliation_flags for a human to review.
//
// ============================================================================
// PHASE A — THIS FILE ONLY DOES THIS. EXPLICITLY, THIS FILE NEVER:
//   - calls praqen_credit_deposit, or any other RPC that moves money
//   - writes to wallets, user_wallets, user_balances, or balance_audit
//   - sends, sweeps, or otherwise touches a single real satoshi or cent
// The ONLY table this service ever writes to is reconciliation_flags.
// Automatic crediting from these flags (Phase B) is separate, unbuilt, and
// requires its own explicit approval before a single line of it is written.
// ============================================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const depositMonitor     = require('./depositMonitor');     // reused for _fetchAddressTxs — same BTC source the real-time monitor uses
const usdtDepositMonitor = require('./usdtDepositMonitor'); // reused for _fetchIncomingTransfers — same USDT source the real-time monitor uses

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);
const RECONCILE_INTERVAL_MS = 120 * 60 * 1000; // 2 hours, reduced to save API calls
const DUST_THRESHOLD_SATS   = 546;
const DUST_THRESHOLD_USDT   = 0.01;
class DepositReconciliationService {
  constructor() {
    this.isRunning        = false;
    this.intervalId       = null;
    this.cycleInProgress  = false;
  }

  // ── Start background hourly polling ────────────────────────────────────
  start() {
    if (this.isRunning) {
      console.log('[DepositReconciliation] Already running — skipping duplicate start');
      return;
    }
    this.isRunning = true;
    console.log(`\n🕵️  DepositReconciliationService started — Phase A (read-only detection + flagging only, no crediting)`);
    console.log(`   Running every ${RECONCILE_INTERVAL_MS / 60000} minutes`);
    this.runFullCycle();
    this.intervalId = setInterval(() => this.runFullCycle(), RECONCILE_INTERVAL_MS);
  }

  stop() {
    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning  = false;
    console.log('[DepositReconciliation] Stopped');
  }

  // ── One full reconciliation pass ────────────────────────────────────────
  async runFullCycle() {
    if (this.cycleInProgress) {
      console.warn('[DepositReconciliation] Previous cycle still running — skipping this tick');
      return;
    }
    this.cycleInProgress = true;
    const start = Date.now();
    console.log(`\n[DepositReconciliation] ⏱  Cycle start ${new Date().toISOString()}`);
    try {
      await this.reconcileAllBtc();
      await this.reconcileAllUsdt();
    } catch (err) {
      console.error('[DepositReconciliation] Cycle error:', err.message);
    } finally {
      this.cycleInProgress = false;
    }
    console.log(`[DepositReconciliation] ✅ Cycle done in ${Date.now() - start}ms\n`);
  }

  // ── BTC: walk every monitored address ──────────────────────────────────
  async reconcileAllBtc() {
    const { data: wallets, error } = await supabaseAdmin
      .from('user_wallets')
      .select('user_id, btc_address')
      .not('btc_address', 'is', null)
      .neq('btc_address', '');
    if (error) { console.error('[DepositReconciliation] BTC address fetch error:', error.message); return; }
    if (!wallets?.length) return;

    console.log(`[DepositReconciliation] Reconciling ${wallets.length} BTC address(es)...`);
    for (const w of wallets) {
      await this.reconcileOneBtcAddress(w.user_id, w.btc_address);
      await this.sleep(1200); // same pacing depositMonitor.js already uses against mempool.space/blockstream
    }
  }

  // ── Fetch tx list with a third fallback (BlockCypher) beyond what
  // depositMonitor._fetchAddressTxs already tries. Some addresses have been
  // observed to persistently time out against both mempool.space and
  // blockstream.info (confirmed against King888's address, same finding
  // already documented for this exact address in BALANCE_MISMATCH_INVESTIGATION.md)
  // while succeeding immediately via BlockCypher. Normalizes BlockCypher's
  // response shape to match the esplora shape (txid/vout/status.confirmed) that
  // the rest of this file's logic already expects, so nothing else needs to change.
  async _fetchAddressTxsResilient(address) {
    try {
      return await depositMonitor._fetchAddressTxs(address);
    } catch (err) {
      console.warn(`[DepositReconciliation] mempool.space/blockstream both failed for ${address.slice(0, 12)}… — falling back to BlockCypher: ${err.message}`);
      const axios = require('axios');
      const { data: full } = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${address}/full?limit=50`, { timeout: 15000 });
      return (full.txs || []).map(tx => ({
        txid: tx.hash,
        vout: (tx.outputs || []).map(o => ({
          scriptpubkey_address: (o.addresses || [])[0],
          value: o.value,
        })),
        status: { confirmed: !!tx.confirmed },
      }));
    }
  }

  async reconcileOneBtcAddress(userId, address) {
    try {
      const txs = await this._fetchAddressTxsResilient(address);
      for (const tx of txs) {
        if (!tx.status?.confirmed) continue;
        const receivedSats = (tx.vout || [])
          .filter(o => o.scriptpubkey_address === address)
          .reduce((s, o) => s + (o.value || 0), 0);
        if (receivedSats <= DUST_THRESHOLD_SATS) continue;
        const amountBtc = parseFloat((receivedSats / 1e8).toFixed(8));
        await this.checkAndFlag({ userId, address, txHash: tx.txid, currency: 'BTC', amount: amountBtc });
      }
    } catch (err) {
      console.error(`[DepositReconciliation] BTC check error for ${address.slice(0, 12)}…:`, err.message);
    }
  }

  // ── USDT: walk every monitored Tron address ────────────────────────────
  async reconcileAllUsdt() {
    const { data: wallets, error } = await supabaseAdmin
      .from('user_wallets')
      .select('user_id, tron_address')
      .not('tron_address', 'is', null)
      .neq('tron_address', '');
    if (error) { console.error('[DepositReconciliation] USDT address fetch error:', error.message); return; }
    if (!wallets?.length) return;

    console.log(`[DepositReconciliation] Reconciling ${wallets.length} USDT address(es)...`);
    for (const w of wallets) {
      await this.reconcileOneUsdtAddress(w.user_id, w.tron_address);
      await this.sleep(600); // same pacing usdtDepositMonitor.js already uses against TronGrid
    }
  }

  async reconcileOneUsdtAddress(userId, address) {
    try {
      const transfers = await usdtDepositMonitor._fetchIncomingTransfers(address);
      for (const t of transfers) {
        if (!t.transaction_id) continue;
        const amountUsdt = parseFloat((Number(t.value || 0) / 1e6).toFixed(6)); // USDT TRC-20: 6 decimals
        if (amountUsdt < DUST_THRESHOLD_USDT) continue;
        await this.checkAndFlag({ userId, address, txHash: t.transaction_id, currency: 'USDT', amount: amountUsdt });
      }
    } catch (err) {
      console.error(`[DepositReconciliation] USDT check error for ${address.slice(0, 12)}…:`, err.message);
    }
  }

  // ── The actual reconciliation check — READ-ONLY. Never credits anything. ──
  // For a given confirmed on-chain payment, this only ever does one of three
  // things: (a) nothing, because it's already known and credited; (b) raise a
  // "seen but not credited" flag; (c) raise a "never seen anywhere" flag.
  // No branch here calls praqen_credit_deposit or touches a balance.
  async checkAndFlag({ userId, address, txHash, currency, amount }) {
    // 1. Already tracked in deposit_tracking_v2 (written by either monitor)?
    const { data: tracked } = await supabaseAdmin
      .from('deposit_tracking_v2')
      .select('id, credited')
      .eq('tx_hash', txHash).eq('address', address)
      .maybeSingle();
    if (tracked) {
      // Known to the new system, but the credit itself never succeeded — the
      // real-time monitor already retries this on its own, but a human should
      // still see it here if it's been stuck a while.
      if (!tracked.credited) {
        await this.raiseFlag({ userId, currency, txHash, address, amount, reason: 'SEEN_BUT_NOT_CREDITED' });
      }
      return;
    }

    // 2. Not in deposit_tracking_v2 — check the real ledger too. Deposits
    // credited before deposit_tracking_v2 existed, or via a one-off manual
    // correction script (e.g. correct-ukbuyer2022-missing-btc-deposit.js),
    // never wrote a deposit_tracking_v2 row but ARE legitimately credited —
    // this must not get flagged as missing.
    const { data: ledgerRows } = await supabaseAdmin
      .from('wallet_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('tx_hash', txHash)
      .limit(1);
    if (ledgerRows && ledgerRows.length > 0) return; // already credited, just predates the new tracking table — nothing to flag

    // 3. Genuinely unaccounted for anywhere — a real, on-chain, confirmed
    // deposit with no record of ever being credited, by any mechanism. Flag it
    // for a human. Phase A stops here — nothing is credited.
    await this.raiseFlag({ userId, currency, txHash, address, amount, reason: 'UNCREDITED_ONCHAIN_DEPOSIT' });
  }

  // ── Write a flag — the ONLY write this entire service performs ──────────
  async raiseFlag({ userId, currency, txHash, address, amount, reason }) {
    // Skip re-flagging the same (user, currency, reason, tx_hash) every single
    // hourly cycle until a human resolves it.
    const { data: existing } = await supabaseAdmin
      .from('reconciliation_flags')
      .select('id')
      .eq('user_id', userId).eq('currency', currency).eq('reason', reason)
      .contains('detail', { tx_hash: txHash })
      .maybeSingle();
    if (existing) return;

    const { error } = await supabaseAdmin.from('reconciliation_flags').insert({
      user_id:             userId,
      currency,
      source_table:        'deposit_reconciliation',
      authoritative_value: null,
      mirror_value:        null,
      diff:                amount,
      reason,
      status:              'RECONCILIATION_REQUIRED',
      detail: {
        tx_hash: txHash, address, amount,
        detected_by: 'depositReconciliationService',
        detected_at: new Date().toISOString(),
      },
    });
    if (error) {
      console.error(`[DepositReconciliation] Failed to write flag for tx ${txHash.slice(0, 12)}…:`, error.message);
      return;
    }
    console.warn(`🚩 [DepositReconciliation] FLAGGED ${reason} — user ${userId.slice(0, 8)} — ${amount} ${currency} — tx ${txHash.slice(0, 12)}…`);
  }

  getStatus() {
    return { running: this.isRunning, interval_min: RECONCILE_INTERVAL_MS / 60000, phase: 'A (detection + flagging only, no crediting)' };
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new DepositReconciliationService();
