// services/swapService.js
// PRAQEN BTC ↔ USDT Swap Service
// Internal ledger transfer — no on-chain transactions.
// Live rate: Binance primary → CoinGecko fallback.
// 0.2% platform fee, credited to company wallet.

require('dotenv').config();
const axios  = require('axios');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SWAP_FEE_RATE     = 0.002; // 0.2% fee
const BINANCE_URL       = process.env.BINANCE_API_URL || 'https://api.binance.com/api/v3';
const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';

// Short-lived cache for the last known-good rate. Two reasons this exists:
//  1. Every source below is queried fresh on every single call otherwise — the swap
//     UI polls this on every tab switch, and CoinGecko's free tier rate-limits
//     (429) well before that adds up across all users, which then looked
//     indistinguishable from the rate being genuinely unreachable.
//  2. If every live source fails at once (seen in practice: Binance and Coinbase
//     both intermittently fail DNS resolution from this host, even though they're
//     not actually down), a recent cached rate lets a swap still go through instead
//     of hard-failing — much better than blocking real swaps over a transient DNS hiccup.
const RATE_CACHE_TTL = 20000; // 20s
let _rateCache = 0;
let _rateCacheAt = 0;

class SwapService {

  // ── Fetch live BTC/USDT rate ──────────────────────────────────────────────
  async getBtcUsdtRate() {
    if (_rateCache > 0 && (Date.now() - _rateCacheAt) < RATE_CACHE_TTL) {
      return _rateCache;
    }

    // Try every source, most-reliable-from-this-host first. Order matters less than
    // simply having more than two — losing any single one (DNS hiccup, rate limit)
    // must not be able to take the whole swap feature down with it.
    const sources = [
      ['CoinGecko', () => axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', { timeout: 8000 }).then(r => parseFloat(r.data?.bitcoin?.usd))],
      ['Binance',   () => axios.get(`${BINANCE_URL}/ticker/price?symbol=BTCUSDT`, { timeout: 8000 }).then(r => parseFloat(r.data?.price))],
      ['Coinbase',  () => axios.get('https://api.coinbase.com/v2/prices/BTC-USD/spot', { timeout: 8000 }).then(r => parseFloat(r.data?.data?.amount))],
      ['Kraken',    () => axios.get('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', { timeout: 8000 }).then(r => parseFloat(Object.values(r.data?.result || {})[0]?.c?.[0]))],
    ];

    for (const [name, fetchRate] of sources) {
      try {
        const rate = await fetchRate();
        if (rate > 100) { // sanity check
          _rateCache = rate;
          _rateCacheAt = Date.now();
          return rate;
        }
      } catch (e) {
        console.warn(`[SwapService] ${name} rate fetch failed:`, e.message);
      }
    }

    // Every live source failed — fall back to the last known-good rate rather than
    // blocking the swap outright, as long as it isn't too stale to trust.
    if (_rateCache > 0 && (Date.now() - _rateCacheAt) < 10 * 60 * 1000) {
      console.warn('[SwapService] All live rate sources failed — using cached rate from', new Date(_rateCacheAt).toISOString());
      return _rateCache;
    }

    throw new Error('Unable to fetch BTC/USDT rate — all price APIs unreachable. Please try again.');
  }

  // ── Fetch wallet balances (single source of truth) ────────────────────────
  async _getWallet(userId) {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('balance_btc, balance_usdt, locked_balance_btc, locked_balance_usdt')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to fetch wallet: ${error.message}`);
    return {
      btc:       parseFloat(data?.balance_btc  || 0),
      usdt:      parseFloat(data?.balance_usdt || 0),
      lockedBtc: parseFloat(data?.locked_balance_btc  || 0),
      lockedUsdt: parseFloat(data?.locked_balance_usdt || 0),
      exists:    !!data,
    };
  }

  // ── Ledger-true BTC balance check ─────────────────────────────────────────
  // balance_audit.new_balance is the independently-recomputed "true" balance
  // from the last integrity sync. If wallets.balance_btc has drifted from it,
  // something changed the raw column outside the normal ledger (a bug, a
  // manual SQL edit) — refuse the swap rather than trust a number that may be
  // an artifact of that drift. This is exactly what let the 2026-08-18
  // manual-SQL-correction incident get laundered into real USDT: two accounts
  // swapped out more BTC than their last confirmed balance, during the window
  // before the corrupted balance was caught and restored.
  //
  // No equivalent audit table exists for USDT yet, so this check only guards
  // the BTC→USDT direction (the one actually exploited). USDT→BTC still only
  // checks the raw wallets.balance_usdt column.
  async _assertLedgerTrueBtc(userId, walletBtc) {
    const { data: lastAudit, error } = await supabaseAdmin
      .from('balance_audit')
      .select('new_balance, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Ledger check failed: ${error.message}`);
    if (!lastAudit) return walletBtc; // no integrity history yet — nothing to check against

    const audited = parseFloat(lastAudit.new_balance);
    const EPSILON = 0.0000001; // 10 sats — rounding tolerance
    if (Math.abs(walletBtc - audited) > EPSILON) {
      throw new Error(
        `Swap refused: your wallet balance (₿${walletBtc.toFixed(8)}) does not match your last verified ` +
        `balance (₿${audited.toFixed(8)} as of ${lastAudit.created_at}). This needs a balance review before ` +
        `swapping — please contact support.`
      );
    }
    return audited;
  }

  // ── Credit company fee wallet ─────────────────────────────────────────────
  // Throws on failure instead of swallowing errors — same fix applied to
  // tronHotWallet.creditFeeToCompany earlier: a blind update-with-no-error-
  // check against a possibly-missing row, or one that races a concurrent
  // swap's fee credit, can silently drop the fee from company revenue with
  // no trace anywhere. Retries on that race; creates the row if missing.
  // Callers must NOT let this failure invalidate the swap itself — by the
  // time this runs, the user's own balance change has already committed
  // (with its own optimistic lock), so the swap genuinely succeeded even if
  // this fee credit needs a retry.
  async _creditCompanyFee(currency, amount) {
    if (amount <= 0) return;
    const field = currency === 'BTC' ? 'balance_btc' : 'balance_usdt';
    const precision = currency === 'BTC' ? 8 : 6;

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: c, error: fetchErr } = await supabaseAdmin
        .from('wallets').select(field).eq('user_id', COMPANY_WALLET_ID).maybeSingle();
      if (fetchErr) throw new Error(`_creditCompanyFee: fetch failed — ${fetchErr.message}`);

      if (!c) {
        const newBal = parseFloat(amount.toFixed(precision));
        const { error: insertErr } = await supabaseAdmin.from('wallets').insert({
          user_id: COMPANY_WALLET_ID,
          [field]: newBal,
          balance_btc: field === 'balance_btc' ? newBal : 0,
          balance_usdt: field === 'balance_usdt' ? newBal : 0,
          locked_balance_btc: 0,
          locked_balance_usdt: 0,
          updated_at: new Date().toISOString(),
        });
        if (insertErr) {
          if (attempt < 4) continue; // someone else's concurrent insert may have won — retry and pick it up
          throw new Error(`_creditCompanyFee: company wallet row missing and insert failed — ${insertErr.message}`);
        }
        return newBal;
      }

      const current = parseFloat(c[field] || 0);
      const newBal  = parseFloat((current + amount).toFixed(precision));

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('wallets')
        .update({ [field]: newBal, updated_at: new Date().toISOString() })
        .eq('user_id', COMPANY_WALLET_ID)
        .eq(field, c[field]) // optimistic lock — retry below if this raced
        .select(field);

      if (updateErr) throw new Error(`_creditCompanyFee: update failed — ${updateErr.message}`);
      if (updated && updated.length > 0) return newBal;
      // 0 rows affected — balance changed concurrently, retry with a fresh read.
    }

    throw new Error('_creditCompanyFee: gave up after 5 attempts — company wallet balance kept changing concurrently');
  }

  // ── Record swap in swap_transactions ─────────────────────────────────────
  async _recordSwap(userId, fromCurrency, toCurrency, fromAmount, toAmount, rate, feeBtc, feeUsdt) {
    const now = new Date().toISOString();
    const [swapResult, feeResult] = await Promise.all([
      supabaseAdmin.from('swap_transactions').insert({
        user_id:       userId,
        from_currency: fromCurrency,
        to_currency:   toCurrency,
        from_amount:   fromAmount,
        to_amount:     toAmount,
        rate,
        fee_btc:       feeBtc,
        fee_usdt:      feeUsdt,
        status:        'COMPLETED',
        created_at:    now,
      }),
      // Audit trail: FEE row in wallet_transactions for company wallet
      supabaseAdmin.from('wallet_transactions').insert({
        user_id:     COMPANY_WALLET_ID,
        type:        'FEE',
        currency:    feeBtc > 0 ? 'BTC' : 'USDT',
        amount_btc:  feeBtc  > 0 ? feeBtc  : 0,
        amount_usdt: feeUsdt > 0 ? feeUsdt : 0,
        status:      'CONFIRMED',
        notes:       `Swap fee: ${fromCurrency}→${toCurrency} | ₿${feeBtc.toFixed(8)} / ₮${feeUsdt.toFixed(6)} | user: ${userId.slice(0, 8)}`,
        created_at:  now,
      }),
    ]);
    if (swapResult.error) console.warn('[SwapService] swap_transactions insert error:', swapResult.error.message);
    if (feeResult.error)  console.warn('[SwapService] wallet_transactions fee insert error:', feeResult.error.message);
  }

  // ── BTC → USDT ────────────────────────────────────────────────────────────
  async swapBtcToUsdt(userId, btcAmount) {
    const amount = parseFloat(btcAmount);
    if (!amount || amount <= 0) throw new Error('Invalid BTC amount');
    if (amount < 0.000001)      throw new Error('Minimum swap: 0.000001 BTC');

    const rate       = await this.getBtcUsdtRate();
    const grossUsdt  = parseFloat((amount * rate).toFixed(6));
    const feeUsdt    = parseFloat((grossUsdt * SWAP_FEE_RATE).toFixed(6));
    const netUsdt    = parseFloat((grossUsdt - feeUsdt).toFixed(6));

    const wallet = await this._getWallet(userId);
    const ledgerBtc = await this._assertLedgerTrueBtc(userId, wallet.btc);
    if (ledgerBtc < amount) {
      throw new Error(
        `Insufficient BTC balance. Available: ${ledgerBtc.toFixed(8)} BTC, Required: ${amount.toFixed(8)} BTC`
      );
    }

    const newBtc  = parseFloat((wallet.btc - amount).toFixed(8));
    const newUsdt = parseFloat((wallet.usdt + netUsdt).toFixed(6));

    // Optimistic lock: reject if balance was modified by a concurrent request
    const { data: swapRows, error: updateErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_btc: newBtc, balance_usdt: newUsdt, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('balance_btc', wallet.btc)   // optimistic lock
      .select('balance_btc');
    if (updateErr) throw new Error(`Swap failed: ${updateErr.message}`);
    if (!swapRows || swapRows.length === 0) throw new Error('Balance changed — please retry the swap');

    // Re-certify the new BTC balance in balance_audit — _assertLedgerTrueBtc above
    // compares wallets.balance_btc against the LAST row here on every BTC→USDT swap.
    // Without this, a successful swap moves the balance away from that last-audited
    // figure but never re-stamps it, so the very next swap attempt always fails the
    // check it just passed. Fire-and-forget like every other balance_audit write in
    // this codebase (tradeEscrowService.js) — logged loudly on failure since a missed
    // stamp here silently re-introduces the false-positive block for this user.
    supabaseAdmin.from('balance_audit').insert({
      user_id:     userId,
      change_btc:  -amount,
      new_balance: newBtc,
      reason:      'SWAP',
      created_at:  new Date().toISOString(),
    }).then(null, (e) => console.error(`[SwapService] ⚠️ balance_audit stamp failed after BTC→USDT swap for ${userId.slice(0, 8)} — their next swap may be falsely blocked:`, e.message));

    // Platform fee → company wallet (in USDT). The user's own swap already
    // committed above — don't fail their successful swap over an internal
    // accounting hiccup, but never let it fail silently either.
    try {
      await this._creditCompanyFee('USDT', feeUsdt);
    } catch (feeErr) {
      console.error(`[SwapService] ⚠️ FEE CREDIT FAILED — needs manual reconciliation: $${feeUsdt} USDT from BTC→USDT swap by ${userId.slice(0, 8)}:`, feeErr.message);
    }

    // Record swap
    const swapRef = 'SWAP_' + crypto.randomBytes(6).toString('hex').toUpperCase();
    await this._recordSwap(userId, 'BTC', 'USDT', amount, netUsdt, rate, 0, feeUsdt);

    // In-app notification
    await supabaseAdmin.from('notifications').insert({
      user_id:    userId,
      type:       'wallet',
      title:      '🔄 Swap Complete!',
      message:    `Swapped ₿${amount.toFixed(8)} BTC → $${netUsdt.toFixed(2)} USDT (rate: $${rate.toFixed(0)}/BTC, fee: $${feeUsdt.toFixed(2)})`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    console.log(`✅ [Swap] BTC→USDT: ${amount} BTC → ${netUsdt} USDT @ $${rate} | fee: $${feeUsdt} | user: ${userId.slice(0,8)}`);

    return {
      success:          true,
      swap_ref:         swapRef,
      from_currency:    'BTC',
      to_currency:      'USDT',
      from_amount:      amount,
      to_amount:        netUsdt,
      rate,
      fee_usdt:         feeUsdt,
      fee_pct:          `${SWAP_FEE_RATE * 100}%`,
      new_btc_balance:  newBtc,
      new_usdt_balance: newUsdt,
    };
  }

  // ── USDT → BTC ────────────────────────────────────────────────────────────
  async swapUsdtToBtc(userId, usdtAmount) {
    const amount = parseFloat(usdtAmount);
    if (!amount || amount <= 0) throw new Error('Invalid USDT amount');
    if (amount < 1)             throw new Error('Minimum swap: 1 USDT');

    const rate      = await this.getBtcUsdtRate();
    const grossBtc  = parseFloat((amount / rate).toFixed(8));
    const feeBtc    = parseFloat((grossBtc * SWAP_FEE_RATE).toFixed(8));
    const netBtc    = parseFloat((grossBtc - feeBtc).toFixed(8));

    const wallet = await this._getWallet(userId);
    if (wallet.usdt < amount) {
      throw new Error(
        `Insufficient USDT balance. Available: $${wallet.usdt.toFixed(2)} USDT, Required: $${amount.toFixed(2)} USDT`
      );
    }

    const newUsdt = parseFloat((wallet.usdt - amount).toFixed(6));
    const newBtc  = parseFloat((wallet.btc + netBtc).toFixed(8));

    // Optimistic lock: reject if balance was modified by a concurrent request
    const { data: swapRows, error: updateErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_usdt: newUsdt, balance_btc: newBtc, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('balance_usdt', wallet.usdt)  // optimistic lock
      .select('balance_usdt');
    if (updateErr) throw new Error(`Swap failed: ${updateErr.message}`);
    if (!swapRows || swapRows.length === 0) throw new Error('Balance changed — please retry the swap');

    // This swap also changes wallets.balance_btc (it's the BTC side of the trade), even
    // though the ledger-true check only runs on the BTC→USDT direction. Re-stamp it here
    // too, or a later BTC→USDT swap will falsely fail against a now-stale audit figure —
    // see the identical stamp in swapBtcToUsdt for the full explanation.
    supabaseAdmin.from('balance_audit').insert({
      user_id:     userId,
      change_btc:  netBtc,
      new_balance: newBtc,
      reason:      'SWAP',
      created_at:  new Date().toISOString(),
    }).then(null, (e) => console.error(`[SwapService] ⚠️ balance_audit stamp failed after USDT→BTC swap for ${userId.slice(0, 8)} — their next BTC→USDT swap may be falsely blocked:`, e.message));

    // Platform fee → company wallet (in BTC). The user's own swap already
    // committed above — don't fail their successful swap over an internal
    // accounting hiccup, but never let it fail silently either.
    try {
      await this._creditCompanyFee('BTC', feeBtc);
    } catch (feeErr) {
      console.error(`[SwapService] ⚠️ FEE CREDIT FAILED — needs manual reconciliation: ₿${feeBtc} BTC from USDT→BTC swap by ${userId.slice(0, 8)}:`, feeErr.message);
    }

    const swapRef = 'SWAP_' + crypto.randomBytes(6).toString('hex').toUpperCase();
    await this._recordSwap(userId, 'USDT', 'BTC', amount, netBtc, rate, feeBtc, 0);

    await supabaseAdmin.from('notifications').insert({
      user_id:    userId,
      type:       'wallet',
      title:      '🔄 Swap Complete!',
      message:    `Swapped $${amount.toFixed(2)} USDT → ₿${netBtc.toFixed(8)} BTC (rate: $${rate.toFixed(0)}/BTC, fee: ₿${feeBtc.toFixed(8)})`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    });

    console.log(`✅ [Swap] USDT→BTC: $${amount} USDT → ${netBtc} BTC @ $${rate} | fee: ${feeBtc} BTC | user: ${userId.slice(0,8)}`);

    return {
      success:          true,
      swap_ref:         swapRef,
      from_currency:    'USDT',
      to_currency:      'BTC',
      from_amount:      amount,
      to_amount:        netBtc,
      rate,
      fee_btc:          feeBtc,
      fee_pct:          `${SWAP_FEE_RATE * 100}%`,
      new_usdt_balance: newUsdt,
      new_btc_balance:  newBtc,
    };
  }
}

module.exports = new SwapService();
