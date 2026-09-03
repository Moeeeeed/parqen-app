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
const emailService       = require('./emailService');      // ops alerts for anything auto-credit can't safely resolve

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);
const RECONCILE_INTERVAL_MS = 120 * 60 * 1000; // 2 hours, reduced to save API calls
const DUST_THRESHOLD_SATS   = 546;
const DUST_THRESHOLD_USDT   = 0.01;

// ── Step 2.2 — Phase B auto-credit. DEFAULT OFF. ─────────────────────────────
// When RECONCILIATION_AUTOCREDIT !== 'true' this service behaves EXACTLY as
// before: detect + flag only, never credits. When it IS 'true', a deposit that
// is (a) confirmed on-chain, (b) absent from BOTH deposit_tracking_v2 AND
// wallet_transactions — re-checked immediately before crediting, (c) already
// flagged on a PREVIOUS cycle (so the realtime + poll paths have had >= one full
// interval to pick it up), and (d) a sane amount, is credited through the same
// atomic praqen_credit_deposit RPC + deterministic idempotency key the monitors
// use. Anything outside those bounds is flagged AND emailed to ops, never credited.
const AUTOCREDIT_ON     = process.env.RECONCILIATION_AUTOCREDIT === 'true';
const OPS_ALERT_EMAIL   = process.env.OPS_ALERT_EMAIL || 'support@praqen.com';
const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : d; };
const AC_MIN_BTC  = num(process.env.RECON_AUTOCREDIT_MIN_BTC,  0.00001);
const AC_MAX_BTC  = num(process.env.RECON_AUTOCREDIT_MAX_BTC,  5);
const AC_MIN_USDT = num(process.env.RECON_AUTOCREDIT_MIN_USDT, 1);
const AC_MAX_USDT = num(process.env.RECON_AUTOCREDIT_MAX_USDT, 50000);
class DepositReconciliationService {
  constructor() {
    this.isRunning        = false;
    this.intervalId       = null;
    this.cycleInProgress  = false;
    this.lastCycleCompletedAt = null; // set at the end of every runFullCycle — read by depositHealthMonitor
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
      this.lastCycleCompletedAt = new Date().toISOString();
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
    // deposit with no record of ever being credited, by any mechanism.
    //
    // Phase A (default): flag it for a human, credit nothing.
    // Phase B (RECONCILIATION_AUTOCREDIT=true): try to credit it safely first;
    // only flag if that isn't safe.
    if (AUTOCREDIT_ON) {
      const handled = await this._autoCreditIfSafe({ userId, address, txHash, currency, amount });
      if (handled) return; // credited (or confirmed already-credited) — no flag needed
    }
    await this.raiseFlag({ userId, currency, txHash, address, amount, reason: 'UNCREDITED_ONCHAIN_DEPOSIT' });
  }

  // ── Step 2.2 — Phase B: credit an unaccounted deposit, but only when every
  // safety condition holds. Returns true if it credited (or proved it was
  // already credited), false if the caller should fall through to raiseFlag.
  // NEVER runs unless RECONCILIATION_AUTOCREDIT === 'true'.
  async _autoCreditIfSafe({ userId, address, txHash, currency, amount }) {
    try {
      // (d) sane amount
      const [lo, hi] = currency === 'BTC' ? [AC_MIN_BTC, AC_MAX_BTC] : [AC_MIN_USDT, AC_MAX_USDT];
      if (!(amount >= lo && amount <= hi)) {
        console.warn(`[DepositReconciliation] auto-credit REFUSED (amount ${amount} ${currency} outside [${lo}, ${hi}]) — flagging + alerting ops. tx ${txHash.slice(0, 12)}…`);
        await this._alertOps('Auto-credit refused: amount out of bounds',
          `${amount} ${currency} for user ${userId} (tx ${txHash}) is outside the auto-credit band [${lo}, ${hi}]. Left for manual review.`);
        return false;
      }

      // (c) must have been flagged on a PREVIOUS cycle — proves it has already had
      // at least one full reconcile interval (and the realtime + poll paths)
      // to be handled, so we're not racing them.
      const { data: priorFlag } = await supabaseAdmin
        .from('reconciliation_flags')
        .select('id, created_at')
        .eq('user_id', userId).eq('currency', currency).eq('reason', 'UNCREDITED_ONCHAIN_DEPOSIT')
        .contains('detail', { tx_hash: txHash })
        .maybeSingle();
      if (!priorFlag) {
        // first sighting — just flag it this cycle; it becomes eligible next cycle
        return false;
      }
      if (Date.now() - Date.parse(priorFlag.created_at) < RECONCILE_INTERVAL_MS) {
        return false; // flagged, but not a full interval ago yet
      }

      // (b) re-verify RIGHT NOW that it is still uncredited everywhere (race guard)
      const [{ data: dtv2Now }, { data: ledgerNow }] = await Promise.all([
        supabaseAdmin.from('deposit_tracking_v2').select('id, credited').eq('tx_hash', txHash).eq('address', address).maybeSingle(),
        supabaseAdmin.from('wallet_transactions').select('id')
          .eq('user_id', userId).eq('type', 'DEPOSIT')
          .or(`tx_hash.eq.${txHash},idempotency_key.eq.${currency}:${userId}:${txHash}`)
          .limit(1),
      ]);
      if ((dtv2Now && dtv2Now.credited) || (ledgerNow && ledgerNow.length)) {
        // it got credited between the cycle read and now — record the marker, resolve the flag
        await supabaseAdmin.from('deposit_tracking_v2').insert({
          tx_hash: txHash, address, user_id: userId, currency, amount,
          credited: true, credited_at: new Date().toISOString(), detected_by: 'reconciliation_job',
        }).then(null, () => {});
        await this._resolveFlag(priorFlag.id, 'already credited by another path before auto-credit ran');
        return true;
      }

      // ── Credit through the same atomic RPC + deterministic key the monitors use ──
      const idempotencyKey = `${currency}:${userId}:${txHash}`;
      // claim in deposit_tracking_v2 first (same "claim then act" the monitors do)
      const { error: claimErr } = await supabaseAdmin.from('deposit_tracking_v2').insert({
        tx_hash: txHash, address, user_id: userId, currency, amount,
        credited: false, detected_by: 'reconciliation_job',
      });
      if (claimErr && !/duplicate|unique/i.test(claimErr.message || '')) {
        console.error(`[DepositReconciliation] auto-credit claim failed for ${txHash.slice(0, 12)}…: ${claimErr.message}`);
        return false; // fall through to raiseFlag
      }

      const { data: newBal, error: rpcErr } = await supabaseAdmin.rpc('praqen_credit_deposit', {
        p_user_id:         userId,
        p_currency:        currency,
        p_amount:          amount,
        p_onchain_balance: amount,
        p_idempotency_key: idempotencyKey,
        p_note:            `Reconciliation auto-credit ${txHash.slice(0, 16)}… to ${address.slice(0, 16)}…`,
      });

      if (rpcErr) {
        if (/duplicate|unique/i.test(rpcErr.message || '') || /idempotency_key/i.test(rpcErr.message || '')) {
          // already credited under this key — mark + resolve
          await supabaseAdmin.from('deposit_tracking_v2').update({ credited: true, credited_at: new Date().toISOString() })
            .eq('tx_hash', txHash).eq('address', address);
          await this._resolveFlag(priorFlag.id, 'auto-credit: RPC reported already-credited under the deterministic key');
          return true;
        }
        console.error(`🚨 [DepositReconciliation] auto-credit RPC FAILED for ${userId} (tx ${txHash.slice(0, 12)}…): ${rpcErr.message}`);
        await supabaseAdmin.from('deposit_tracking_v2').update({ credit_error: rpcErr.message }).eq('tx_hash', txHash).eq('address', address);
        await this._alertOps('Auto-credit RPC failed',
          `praqen_credit_deposit failed for user ${userId}, ${amount} ${currency}, tx ${txHash}: ${rpcErr.message}. Left flagged for manual review.`);
        return false; // fall through to raiseFlag
      }

      await supabaseAdmin.from('deposit_tracking_v2').update({ credited: true, credited_at: new Date().toISOString() })
        .eq('tx_hash', txHash).eq('address', address);
      await this._resolveFlag(priorFlag.id, `auto-credited ${amount} ${currency} — new balance ${parseFloat(newBal)}`);
      console.log(`✅ [DepositReconciliation] AUTO-CREDITED ${amount} ${currency} to user ${userId.slice(0, 8)} (tx ${txHash.slice(0, 16)}…) — new balance ${parseFloat(newBal)}`);
      return true;

    } catch (err) {
      console.error(`[DepositReconciliation] _autoCreditIfSafe error for ${txHash.slice(0, 12)}…: ${err.message}`);
      return false; // never throw out of here — fall through to raiseFlag
    }
  }

  async _resolveFlag(flagId, note) {
    await supabaseAdmin.from('reconciliation_flags')
      .update({ status: 'RESOLVED', resolved_at: new Date().toISOString(), resolution_notes: note })
      .eq('id', flagId).then(null, () => {});
  }

  async _alertOps(subject, body) {
    try {
      await emailService.sendEmail({
        to: OPS_ALERT_EMAIL,
        subject: `🚨 PRAQEN reconciliation — ${subject}`,
        type: 'reconciliation_autocredit_alert',
        html: `<p><strong>${subject}</strong></p><p>${body}</p><p style="color:#6B7280;font-size:12px">services/depositReconciliationService.js — Phase B auto-credit.</p>`,
      });
    } catch (e) { console.error('[DepositReconciliation] ops alert failed:', e.message); }
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
    return {
      running: this.isRunning,
      interval_min: RECONCILE_INTERVAL_MS / 60000,
      phase: AUTOCREDIT_ON
        ? 'B (auto-credit ENABLED — safe unaccounted deposits are credited, rest flagged)'
        : 'A (detection + flagging only, no crediting)',
      autocredit: AUTOCREDIT_ON,
      lastCycleCompletedAt: this.lastCycleCompletedAt,
    };
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = new DepositReconciliationService();
