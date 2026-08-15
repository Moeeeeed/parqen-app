'use strict';
/**
 * tronHotWallet.js — PRAQEN USDT Hot Wallet Service
 *
 * Architecture:
 *   User deposit address  →  receive USDT on-chain (per-user)
 *   Hot wallet            →  sends ALL outgoing USDT withdrawals
 *   Sweeper               →  moves USDT from user deposit addresses → hot wallet
 *   Company wallet        →  receives platform fees (internal ledger)
 *
 * Safety rules:
 *   1. Caller must deduct user DB balance BEFORE calling sendUsdtToExternal()
 *   2. Caller must restore DB balance if sendUsdtToExternal() throws
 *   3. Sweep failures are NON-FATAL — user's internal balance is already credited
 *   4. All sweeps are logged in hot_wallet_sweeps for full audit trail
 *   5. TRX level checked before every withdrawal — blocks if too low
 *   6. Never expose private keys outside this module
 */

require('dotenv').config();
const axios      = require('axios');
const { createClient } = require('@supabase/supabase-js');
const tronWallet = require('./tronWalletService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// ── Config ────────────────────────────────────────────────────────────────────
const HOT_ID            = process.env.PRAQEN_HOT_WALLET_IDENTIFIER         || 'praqen_hot_wallet_main';
const COMPANY_ID        = process.env.PRAQEN_COMPANY_WALLET_IDENTIFIER     || 'praqen_company_wallet';
const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';
const TRONGRID_KEY      = process.env.TRONGRID_API_KEY || '';
const MIN_TRX_RESERVE   = parseInt(process.env.HOT_WALLET_MIN_TRX   || '100',  10);
const TRX_PER_SWEEP     = parseInt(process.env.HOT_WALLET_TRX_SWEEP || '20',   10);
const USDT_WITHDRAWAL_FEE = parseFloat(process.env.USDT_WITHDRAWAL_FEE || '1.0'); // flat fee per withdrawal

function tronHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (TRONGRID_KEY) h['TRON-PRO-API-KEY'] = TRONGRID_KEY;
  return h;
}

// ─────────────────────────────────────────────────────────────────────────────

class TronHotWallet {

  constructor() {
    this._hotAddress     = null;
    this._companyAddress = null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADDRESS HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /** Deterministic hot wallet address — derived once, cached forever */
  getHotWalletAddress() {
    if (!this._hotAddress) {
      this._hotAddress = tronWallet.generateAddress(HOT_ID).address;
    }
    return this._hotAddress;
  }

  /** Deterministic company wallet Tron address (for fee collection cold-out) */
  getCompanyTronAddress() {
    if (!this._companyAddress) {
      this._companyAddress = tronWallet.generateAddress('praqen_company_wallet').address;
    }
    return this._companyAddress;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BALANCE CHECKS
  // ══════════════════════════════════════════════════════════════════════════

  /** On-chain USDT balance of the hot wallet */
  async getUsdtBalance() {
    return tronWallet.getUSDTBalance(this.getHotWalletAddress());
  }

  /** TRX balance of the hot wallet (gas monitoring) */
  async getTrxBalance() {
    return this._getTrxAt(this.getHotWalletAddress());
  }

  /** TRX balance at any Tron address */
  async _getTrxAt(address) {
    try {
      const r = await axios.get(
        `https://api.trongrid.io/v1/accounts/${address}`,
        { headers: tronHeaders(), timeout: 10000 }
      );
      return (r.data?.data?.[0]?.balance || 0) / 1_000_000; // SUN → TRX
    } catch (e) {
      console.warn(`[HotWallet] TRX balance check failed for ${address?.slice(0, 10)}…: ${e.message}`);
      return 0;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WITHDRAWAL — USDT FROM HOT WALLET TO EXTERNAL ADDRESS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Send USDT from hot wallet to an external Tron address.
   * Caller MUST:
   *   1. Deduct user's DB balance (amount + fee) BEFORE calling this
   *   2. Credit fee to company wallet BEFORE calling this
   *   3. Restore DB balance if this throws
   *
   * @param {string} toAddress   - Destination Tron address
   * @param {number} amountUsdt  - Net amount user receives (fee already excluded)
   * @returns {object}           - { txid, explorer_url, ... }
   */
  async sendUsdtToExternal(toAddress, amountUsdt) {
    const hotAddr = this.getHotWalletAddress();

    if (!tronWallet.isValidTronAddress(toAddress)) {
      throw new Error('Invalid destination Tron address — must start with T and be 34 characters');
    }
    if (toAddress === hotAddr) {
      throw new Error('Destination cannot be the PRAQEN hot wallet itself');
    }
    if (amountUsdt <= 0) {
      throw new Error('Withdrawal amount must be greater than zero');
    }

    // ── Pre-flight: check on-chain USDT balance ─────────────────────────────
    const onchain = await this.getUsdtBalance();
    if (onchain < amountUsdt) {
      throw new Error(
        `Sorry, we are experiencing a blockchain issue. Please try again later or contact support. This issue is from the blockchain.`
      );
    }

    // ── Pre-flight: check TRX for gas ──────────────────────────────────────
    const trx = await this.getTrxBalance();
    if (trx < 20) {
      throw new Error(
        `Sorry, we are experiencing a blockchain issue. Please try again later or contact support. This issue is from the blockchain.`
      );
    }

    // ── Execute on-chain transfer ───────────────────────────────────────────
    console.log(`\n🔥 [HotWallet] Withdrawal: ₮${amountUsdt} → ${toAddress}`);
    const result = await tronWallet.sendUSDT(HOT_ID, toAddress, amountUsdt);
    console.log(`✅ [HotWallet] Withdrawal complete | txid: ${result.txid}`);

    // ── Warn if TRX running low ─────────────────────────────────────────────
    if (trx < MIN_TRX_RESERVE) {
      console.warn(`⚠️  [HotWallet] TRX reserve LOW: ${trx.toFixed(2)} TRX — top up needed!`);
    }

    return result;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FEES — CREDIT TO COMPANY WALLET INTERNAL LEDGER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Credit a fee amount to the company wallet's internal USDT ledger.
   * Does NOT move any on-chain funds — purely a DB credit.
   * On-chain representation: fees accumulate in the hot wallet until collected.
   *
   * @param {number} amountUsdt - Fee amount to credit
   * @param {string} note       - Description for logs
   */
  async creditFeeToCompany(amountUsdt, note) {
    if (amountUsdt <= 0) return;

    const { data: cw, error: fetchErr } = await supabase
      .from('wallets')
      .select('balance_usdt')
      .eq('user_id', COMPANY_WALLET_ID)
      .maybeSingle();

    if (fetchErr) {
      console.error('[HotWallet] creditFeeToCompany: fetch failed:', fetchErr.message);
      return;
    }

    const current = parseFloat(cw?.balance_usdt || 0);
    const newBal  = parseFloat((current + amountUsdt).toFixed(6));

    const { error: updateErr } = await supabase
      .from('wallets')
      .update({ balance_usdt: newBal, updated_at: new Date().toISOString() })
      .eq('user_id', COMPANY_WALLET_ID);

    if (updateErr) {
      console.error('[HotWallet] creditFeeToCompany: update failed:', updateErr.message);
    } else {
      console.log(`[HotWallet] 💰 +₮${amountUsdt} fee → company wallet (${note}) | total: ₮${newBal}`);
    }

    return newBal;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SWEEPER — MOVE DEPOSITED USDT FROM USER ADDRESSES → HOT WALLET
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Attempt to sweep USDT from a user's deposit address to the hot wallet.
   * Safe to fail — user's internal balance is already credited.
   * If the user address has no TRX, we fund it from the hot wallet first.
   *
   * @param {string} userId       - PRAQEN user ID (UUID)
   * @param {string} userAddress  - User's Tron deposit address
   * @param {number} amountUsdt   - Amount to sweep
   */
  async sweepFromUserAddress(userId, userAddress, amountUsdt) {
    const hotAddr = this.getHotWalletAddress();

    if (userAddress === hotAddr) return; // already in hot wallet
    if (!tronWallet.isValidTronAddress(userAddress)) return;
    if (amountUsdt < 0.01) return; // dust

    console.log(`[HotWallet] 🧹 Sweeping ₮${amountUsdt} from ${userAddress}...`);

    // Check TRX at user address
    const userTrx = await this._getTrxAt(userAddress);

    if (userTrx < 15) {
      // Fund TRX first so the sweep transaction can pay gas
      console.log(`[HotWallet] User address has ${userTrx.toFixed(2)} TRX — funding ${TRX_PER_SWEEP} TRX for sweep gas`);
      try {
        await this._sendTrxToAddress(userAddress, TRX_PER_SWEEP);
        // Wait for TRX to land (~6s = ~2 block times on Tron)
        await new Promise(r => setTimeout(r, 6000));
      } catch (fundErr) {
        console.error(`[HotWallet] TRX funding failed — deferring sweep:`, fundErr.message);
        await this._recordSweep(userId, userAddress, amountUsdt, 'PENDING', null, `TRX funding failed: ${fundErr.message}`);
        return { deferred: true, reason: fundErr.message };
      }
    }

    // Execute USDT sweep: user address → hot wallet
    try {
      const tx   = await tronWallet.sendUSDT(`user_${userId}`, hotAddr, amountUsdt);
      const txid = tx.txid;
      await this._recordSweep(userId, userAddress, amountUsdt, 'COMPLETED', txid, null);
      console.log(`✅ [HotWallet] Sweep complete: ₮${amountUsdt} | txid: ${txid}`);
      return { deferred: false, txid };
    } catch (sweepErr) {
      console.error(`[HotWallet] Sweep USDT failed — logged as PENDING:`, sweepErr.message);
      await this._recordSweep(userId, userAddress, amountUsdt, 'PENDING', null, sweepErr.message);
      return { deferred: true, reason: sweepErr.message };
    }
  }

  /**
   * Process all PENDING sweeps (called by deposit monitor every cycle).
   * Retries sweeps that previously failed due to TRX/network issues.
   */
  async processPendingSweeps() {
    const { data: pending } = await supabase
      .from('hot_wallet_sweeps')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(10);

    if (!pending?.length) return;
    const hotAddr = this.getHotWalletAddress();
    console.log(`[HotWallet] 🔄 Processing ${pending.length} pending sweep(s)...`);

    for (const row of pending) {
      try {
        // Re-verify on-chain USDT still at user address
        let onchain;
        try {
          onchain = await tronWallet.getUSDTBalance(row.from_address);
        } catch (apiErr) {
          // TronGrid is unreachable — keep PENDING so we retry next cycle
          // (do NOT mark STALE: we can't tell if USDT is there or not)
          console.warn(`[HotWallet] TronGrid API error for sweep ${row.id} — keeping PENDING:`, apiErr.message);
          await supabase.from('hot_wallet_sweeps')
            .update({ error: `API error (will retry): ${apiErr.message.slice(0, 200)}`, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          continue;
        }

        const sweepAmt = parseFloat(row.amount_usdt);

        if (onchain < sweepAmt - 0.001) {
          // Balance confirmed reachable but lower than expected — already swept or spent
          await supabase.from('hot_wallet_sweeps')
            .update({ status: 'STALE', error: `On-chain (${onchain.toFixed(2)}) < expected (${sweepAmt.toFixed(2)})`, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          console.log(`[HotWallet] Sweep ${row.id} marked STALE (on-chain balance changed)`);
          continue;
        }

        // Fund TRX if needed
        const userTrx = await this._getTrxAt(row.from_address);
        if (userTrx < 15) {
          await this._sendTrxToAddress(row.from_address, TRX_PER_SWEEP);
          await new Promise(r => setTimeout(r, 6000));
        }

        // Sweep
        const tx   = await tronWallet.sendUSDT(`user_${row.user_id}`, hotAddr, sweepAmt);
        const txid = tx.txid;

        await supabase.from('hot_wallet_sweeps')
          .update({ status: 'COMPLETED', txid, error: null, updated_at: new Date().toISOString() })
          .eq('id', row.id);

        console.log(`✅ [HotWallet] Retry sweep OK: ₮${sweepAmt} from ${row.from_address} | txid: ${txid}`);

      } catch (e) {
        const msg = e.message?.slice(0, 300) || 'unknown error';
        console.error(`[HotWallet] Retry sweep failed for ${row.from_address}: ${msg}`);
        // Keep as PENDING so next cycle retries — never permanently abandon
        await supabase.from('hot_wallet_sweeps')
          .update({ error: msg, updated_at: new Date().toISOString() })
          .eq('id', row.id);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — COLLECT FEES TO COLD WALLET
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Admin: cash out accumulated USDT fees from hot wallet to a cold wallet.
   * Deducts from company wallet's internal balance and sends on-chain.
   *
   * @param {number} amountUsdt  - Amount to cash out
   * @param {string} toAddress   - Cold wallet destination address
   */
  async collectFeesToColdWallet(amountUsdt, toAddress) {
    if (!tronWallet.isValidTronAddress(toAddress)) {
      throw new Error('Invalid cold wallet Tron address');
    }

    // Check company wallet has enough credited
    const { data: cw } = await supabase
      .from('wallets').select('balance_usdt').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
    const companyBal = parseFloat(cw?.balance_usdt || 0);
    if (companyBal < amountUsdt) {
      throw new Error(`Company wallet only has ₮${companyBal.toFixed(2)} — cannot collect ₮${amountUsdt.toFixed(2)}`);
    }

    // Deduct from company balance first
    const newCompanyBal = parseFloat((companyBal - amountUsdt).toFixed(6));
    await supabase.from('wallets')
      .update({ balance_usdt: newCompanyBal, updated_at: new Date().toISOString() })
      .eq('user_id', COMPANY_WALLET_ID);

    // Send from hot wallet
    let result;
    try {
      result = await this.sendUsdtToExternal(toAddress, amountUsdt);
    } catch (sendErr) {
      // Restore company balance if send fails
      await supabase.from('wallets')
        .update({ balance_usdt: companyBal, updated_at: new Date().toISOString() })
        .eq('user_id', COMPANY_WALLET_ID);
      throw sendErr;
    }

    console.log(`[HotWallet] 🏦 Fee collection: ₮${amountUsdt} → ${toAddress} | txid: ${result.txid}`);
    return { ...result, new_company_balance: newCompanyBal };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STATUS
  // ══════════════════════════════════════════════════════════════════════════

  async getStatus() {
    const hotAddr = this.getHotWalletAddress();

    const [usdtBal, trxBal, companyRow, pendingCount, completedToday] = await Promise.all([
      this.getUsdtBalance().catch(() => null),
      this.getTrxBalance().catch(() => null),
      supabase.from('wallets').select('balance_usdt').eq('user_id', COMPANY_WALLET_ID).maybeSingle(),
      supabase.from('hot_wallet_sweeps').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      supabase.from('hot_wallet_sweeps').select('amount_usdt').eq('status', 'COMPLETED')
        .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
    ]);

    const todayVolume = (completedToday?.data || []).reduce((s, r) => s + parseFloat(r.amount_usdt || 0), 0);

    return {
      hot_wallet_address:   hotAddr,
      hot_wallet_usdt:      usdtBal,
      hot_wallet_trx:       trxBal,
      trx_status:           trxBal === null ? 'unknown' : trxBal >= MIN_TRX_RESERVE ? 'ok' : trxBal >= 20 ? 'low' : 'critical',
      min_trx_reserve:      MIN_TRX_RESERVE,
      company_wallet_usdt:  parseFloat(companyRow?.data?.balance_usdt || 0),
      pending_sweeps:       pendingCount?.count || 0,
      swept_today_usdt:     todayVolume,
      withdrawal_fee_usdt:  USDT_WITHDRAWAL_FEE,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  /** Send TRX from hot wallet to any address (for sweep gas funding) */
  async _sendTrxToAddress(toAddress, trxAmount) {
    tronWallet.initialize();
    const TronWebClass = this._getTronWebClass();
    const pk = tronWallet.getPrivateKeyHex(HOT_ID);
    const tw = new TronWebClass({
      fullHost:   'https://api.trongrid.io',
      headers:    tronHeaders(),
      privateKey: pk,
    });

    const sunAmount = Math.floor(trxAmount * 1_000_000);
    const tx = await tw.trx.sendTransaction(toAddress, sunAmount);

    if (!tx?.result && !tx?.txid) {
      throw new Error(`TRX send failed: ${JSON.stringify(tx)}`);
    }

    // A txid back only means it was accepted for broadcast — confirm it
    // actually landed before treating gas funding as complete. Without this,
    // an underfunded hot wallet reports a fake success and the sweep that
    // depends on this gas silently no-ops.
    const confirmation = await tronWallet.waitForConfirmation(tx.txid);
    if (!confirmation.confirmed) {
      throw new Error(`TRX funding did not confirm on-chain (txid ${tx.txid}): ${confirmation.reason}`);
    }

    console.log(`[HotWallet] Sent ${trxAmount} TRX → ${toAddress} | txid: ${tx.txid}`);
    return tx;
  }

  /** Insert a sweep record into hot_wallet_sweeps */
  async _recordSweep(userId, fromAddress, amountUsdt, status, txid, error) {
    const { error: dbErr } = await supabase.from('hot_wallet_sweeps').insert({
      user_id:      userId,
      from_address: fromAddress,
      amount_usdt:  amountUsdt,
      status,
      txid:         txid  || null,
      error:        error ? error.slice(0, 300) : null,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    });
    if (dbErr) console.error('[HotWallet] _recordSweep DB error:', dbErr.message);
  }

  _getTronWebClass() {
    const mod = require('tronweb');
    return mod.TronWeb || mod;
  }

  /** Called once at startup — logs hot wallet address for admin */
  logStartup() {
    try {
      const hotAddr     = this.getHotWalletAddress();
      const companyAddr = this.getCompanyTronAddress();
      console.log('\n🔥 PRAQEN USDT Hot Wallet Service');
      console.log(`   Hot wallet address  : ${hotAddr}`);
      console.log(`   Company Tron address: ${companyAddr}`);
      console.log(`   Withdrawal fee      : ₮${USDT_WITHDRAWAL_FEE} per withdrawal`);
      console.log(`   Min TRX reserve     : ${MIN_TRX_RESERVE} TRX`);
      console.log(`   ⚠️  Fund hot wallet with TRX (min ${MIN_TRX_RESERVE}) and USDT before withdrawals go live\n`);
    } catch (e) {
      console.warn('[HotWallet] logStartup error (mnemonic not set?):', e.message);
    }
  }
}

module.exports = new TronHotWallet();
