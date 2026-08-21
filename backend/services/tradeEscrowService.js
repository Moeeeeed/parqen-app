// services/tradeEscrowService.js
// PRAQEN — Trade Escrow Service (Production Ready)
// Replaces old Coinbase SDK with HD Wallet system
// Handles: lock, release, refund, cancel, expired trades

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const hdWallet = require('./hdWalletService');
const { checkAndAwardBadges } = require('./badgeService');
const { updateOfferStatus } = require('./offerStatusService');
const { sendTradeAlert, sendSystemAlert } = require('./pushNotificationService');
const { sendTelegramAlert } = require('./telegramService');

// ── Supabase admin (bypasses RLS) ─────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const FEE_RATE            = 0.01;
const COMPANY_WALLET_ID   = '14762cd0-d3b2-474f-acab-fe0071961e9a';
const COMPANY_BTC_ADDRESS = 'bc1qd8z3zdn2e3eul6y8nmcyjvgle3yzv8ttvsjp49';

// `wallets` is the single source of truth for BTC balance, but two secondary
// tables (user_balances, user_wallets — both BTC-only, neither has a USDT
// column) are still read elsewhere in the app (profile endpoint, sell-offer
// auto-pause). Trade release and cancel/refund only ever wrote to `wallets`,
// so those two tables silently drifted stale after every single completed or
// cancelled trade. Best-effort, non-fatal — a hiccup here must never block
// the real fund movement in `wallets`, which has already succeeded by the
// time this is called.
async function syncSecondaryBtcBalance(userId, newBtcBalance) {
  try {
    await Promise.all([
      supabaseAdmin.from('user_balances').update({ balance_btc: newBtcBalance, updated_at: new Date().toISOString() }).eq('user_id', userId),
      supabaseAdmin.from('user_wallets').update({ balance_btc: newBtcBalance, updated_at: new Date().toISOString() }).eq('user_id', userId),
    ]);
  } catch (e) {
    console.error('[Escrow] syncSecondaryBtcBalance failed (non-fatal):', e.message);
  }
}

// After every trade / withdrawal: sync SELL listings to the seller's current balance.
//   • If balance hits zero  → PAUSE all SELL offers + notify.
//   • If balance is positive but max_limit_usd > balance value → cap max_limit_usd.
// NEVER throws — must not break the caller.
async function pauseSellOffersIfEmpty(sellerId) {
  try {
    const { data: bal } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', sellerId).maybeSingle();
    const balance    = parseFloat(bal?.balance_btc || 0);
    const BTC_PRICE  = 88000; // approximate — used only for USD cap comparison
    const balanceUsd = balance * BTC_PRICE;

    if (balance <= 0.000001) {
      // Wallet empty → pause all SELL offers
      const { data: paused } = await supabaseAdmin
        .from('listings')
        .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
        .eq('seller_id', sellerId)
        .eq('status', 'ACTIVE')
        .in('listing_type', ['SELL', 'SELL_BITCOIN'])
        .select('id');

      if (paused && paused.length > 0) {
        console.log(`⏸ [AutoPause] ${paused.length} sell offer(s) paused — wallet empty for ${sellerId.slice(0,8)}`);
        await supabaseAdmin.from('notifications').insert({
          user_id:    sellerId,
          type:       'wallet',
          title:      '⏸ Sell Offers Paused',
          message:    `Your sell offer${paused.length > 1 ? 's have' : ' has'} been automatically paused because your Bitcoin balance is empty. Top up your wallet to reactivate them.`,
          action:     '/wallet',
          is_read:    false,
          created_at: new Date().toISOString(),
        });
      }
      return;
    }

    // Wallet not empty — cap max_limit_usd to current balance value on all SELL offers
    const { data: sellOffers } = await supabaseAdmin
      .from('listings')
      .select('id, max_limit_usd, min_limit_usd')
      .eq('seller_id', sellerId)
      .in('listing_type', ['SELL', 'SELL_BITCOIN'])
      .in('status', ['ACTIVE', 'PAUSED']);

    if (!sellOffers || sellOffers.length === 0) return;

    for (const offer of sellOffers) {
      const currentMax = parseFloat(offer.max_limit_usd || 0);
      if (currentMax > balanceUsd) {
        // Cap max to balance; ensure min doesn't exceed the new capped max
        const newMax = Math.max(10, parseFloat(balanceUsd.toFixed(2)));
        const newMin = Math.min(parseFloat(offer.min_limit_usd || 10), newMax);
        await supabaseAdmin.from('listings')
          .update({ max_limit_usd: newMax, min_limit_usd: newMin, updated_at: new Date().toISOString() })
          .eq('id', offer.id);
        console.log(`📉 [AutoCap] Offer ${offer.id.slice(0,8)} max capped $${currentMax.toFixed(0)} → $${newMax.toFixed(0)} (balance $${balanceUsd.toFixed(0)})`);
      }
    }
  } catch (err) {
    console.error('[pauseSellOffersIfEmpty]', err.message);
  }
}

// Guarantee a wallets row exists for a user. Called before every escrow operation.
// Uses select-then-insert so it works even if wallets.user_id has no unique constraint.
async function ensureWalletExists(userId) {
  try {
    const { data: existing } = await supabaseAdmin
      .from('wallets').select('user_id').eq('user_id', userId).maybeSingle();
    if (!existing) {
      const { error: insertErr } = await supabaseAdmin.from('wallets').insert({
        user_id:            userId,
        address:            hdWallet.generateUserAddress(userId).address,
        private_key:        'placeholder_private_key', // never read back — keys are re-derived from MNEMONIC on demand
        balance_btc:        0,
        locked_balance_btc: 0,
        updated_at:         new Date().toISOString(),
      });
      if (insertErr && !insertErr.message?.includes('duplicate')) {
        console.warn(`[ensureWalletExists] insert warn for ${userId.slice(0,8)}: ${insertErr.message}`);
      } else if (!insertErr) {
        console.log(`[ensureWalletExists] created wallets row for ${userId.slice(0,8)}`);
      }
    }
  } catch (e) {
    console.warn(`[ensureWalletExists] error for ${userId.slice(0,8)}: ${e.message}`);
  }
}

class TradeEscrowService {

  constructor() {
    this.feeRate = FEE_RATE;
  }

  // ── Helper: send in-app notification ───────────────────────────────────────
  async notify(userId, type, title, message, action, extra = {}) {
    try {
      const hasExtra = extra && (extra.actor_id || extra.direction || extra.trade_id);
      const payload = {
        user_id:    userId,
        type,
        title,
        message,
        action:     action || '/my-trades',
        is_read:    false,
        created_at: new Date().toISOString(),
      };
      if (hasExtra) payload.data = extra;
      const { error } = await supabaseAdmin.from('notifications').insert(payload);
      if (error) {
        console.error('[Escrow] Notification error:', error.message);
        // Retry without data if the column doesn't exist yet
        if (hasExtra && (error.message?.includes('"data"') || error.code === '42703')) {
          const base = { user_id: userId, type, title, message, action: action || '/my-trades', is_read: false, created_at: new Date().toISOString() };
          const { error: e2 } = await supabaseAdmin.from('notifications').insert(base);
          if (e2) console.error('[Escrow] Notification retry error:', e2.message);
        }
      }
    } catch (e) {
      console.error('[Escrow] Notification error:', e.message);
    }
  }

  // ── Helper: log trade event to wallet_transactions ─────────────────────────
  // currency defaults to 'BTC' for all existing callers — pass 'USDT' for USDT trades
  async logTransaction(userId, type, amount, txHash, notes, currency = 'BTC') {
    try {
      const row = {
        user_id:    userId,
        type,
        status:     'CONFIRMED',
        tx_hash:    txHash || null,
        notes:      notes  || null,
        currency,
        created_at: new Date().toISOString(),
      };
      if (currency === 'USDT') {
        row.amount_usdt = amount;
      } else {
        row.amount_btc = amount;
      }
      await supabaseAdmin.from('wallet_transactions').insert(row);
    } catch (e) {
      console.error('[Escrow] Log transaction error:', e.message);
    }
  }

  // ============================================================
  // LOCK FUNDS IN ESCROW
  // Called when trade is created
  // Deducts from seller's PRAQEN wallet balance
  // Generates unique escrow address for this trade
  // ============================================================
  // currency = 'BTC' (default) or 'USDT'
  async lockFundsInEscrow(tradeId, btcProviderId, amount, timeLimitMins = 30, currency = 'BTC') {
    const isUsdt = currency === 'USDT';
    console.log(`\n🔒 lockFundsInEscrow — Trade: ${tradeId.slice(0,8)}, Provider: ${btcProviderId.slice(0,8)}, Amount: ${amount} ${currency}`);

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) throw new Error('Invalid escrow amount');

    await ensureWalletExists(btcProviderId);

    // ── 1. Get provider balance ────────────────────────────────────────────
    const balField    = isUsdt ? 'balance_usdt'        : 'balance_btc';
    const lockedField = isUsdt ? 'locked_balance_usdt' : 'locked_balance_btc';

    const { data: walletRow, error: walletErr } = await supabaseAdmin
      .from('wallets')
      .select(`${balField}, ${lockedField}`)
      .eq('user_id', btcProviderId)
      .single();

    if (walletErr || !walletRow) {
      throw new Error(`Wallet not found for provider ${btcProviderId.slice(0,8)}`);
    }

    const currentBalance = parseFloat(walletRow[balField] || 0);
    if (currentBalance < parsedAmount) {
      throw new Error(
        `Insufficient ${currency} balance. Provider has ${currentBalance.toFixed(isUsdt ? 2 : 8)} ${currency}, needs ${parsedAmount.toFixed(isUsdt ? 2 : 8)} ${currency}`
      );
    }

    // ── 2. Generate escrow address ─────────────────────────────────────────
    const escrowData    = isUsdt
      ? require('./tronWalletService').generateEscrowAddress(tradeId)
      : hdWallet.generateEscrowAddress(tradeId);
    const escrowAddress = escrowData.address;
    const feeAmount     = parseFloat((parsedAmount * this.feeRate).toFixed(isUsdt ? 6 : 8));

    console.log(`   Escrow address: ${escrowAddress}`);
    console.log(`   Fee (1%):       ${feeAmount} ${currency}`);

    // ── 3. Deduct from available, add to locked ────────────────────────────
    const newAvailable = parseFloat((currentBalance - parsedAmount).toFixed(isUsdt ? 6 : 8));
    const newLocked    = parseFloat((parseFloat(walletRow[lockedField] || 0) + parsedAmount).toFixed(isUsdt ? 6 : 8));

    const updateFields = {
      [balField]:    newAvailable,
      [lockedField]: newLocked,
      updated_at:    new Date().toISOString(),
    };

    // Optimistic concurrency: only write if the balance/locked fields still match what
    // we just read. Without this, two near-simultaneous lockFundsInEscrow calls for the
    // same provider (e.g. two buyers opening trades against the same SELL offer at once)
    // both read the same currentBalance, both compute a deduction from it, and the second
    // UPDATE silently overwrites the first — the loser's escrow_locks row and FUNDS_LOCKED
    // trade go on to exist with no real balance behind them ("phantom funds"), because the
    // wallet was only ever debited once for BTC that got promised twice.
    const { data: deductRows, error: deductErr } = await supabaseAdmin
      .from('wallets').update(updateFields)
      .eq('user_id', btcProviderId)
      .eq(balField, currentBalance)
      .eq(lockedField, parseFloat(walletRow[lockedField] || 0))
      .select('user_id');
    if (deductErr) throw new Error(`Failed to lock funds: ${deductErr.message}`);
    if (!deductRows || deductRows.length === 0) {
      throw new Error(`Balance changed while locking funds — please retry (concurrent trade likely claimed this balance first).`);
    }

    // ── 4. Deterministic lock reference ───────────────────────────────────
    const crypto = require('crypto');
    const lockTxHash = 'ESCROW_LOCK_' + crypto
      .createHash('sha256')
      .update(`${tradeId}:${btcProviderId}:${parsedAmount}:${Date.now()}`)
      .digest('hex').slice(0, 32).toUpperCase();

    console.log(`🔒 Escrow lock reference: ${lockTxHash}`);

    // ── 5. Create escrow_locks record ─────────────────────────────────────
    const escrowRow = {
      trade_id:       tradeId,
      seller_id:      btcProviderId,
      escrow_address: escrowAddress,
      tx_hash:        lockTxHash,
      status:         'LOCKED',
      currency,
      locked_at:      new Date().toISOString(),
    };
    // escrow_locks.amount_btc is NOT NULL at the schema level (a leftover from before
    // USDT support was added) — leaving it unset on a USDT row fails the insert with a
    // "null value in column amount_btc violates not-null constraint" error. That failure
    // was being caught by the generic error handler in server.js and surfaced to users as
    // "insufficient funds", which was never the actual problem: it silently broke EVERY
    // USDT trade at the escrow step, regardless of the seller's real balance.
    escrowRow.amount_btc = isUsdt ? 0 : parsedAmount;
    if (isUsdt) escrowRow.amount_usdt = parsedAmount;

    const { error: lockErr } = await supabaseAdmin.from('escrow_locks').insert(escrowRow);

    if (lockErr) {
      // Revert wallet changes on escrow_locks failure
      await supabaseAdmin.from('wallets')
        .update({
          [balField]:    currentBalance,
          [lockedField]: parseFloat(walletRow[lockedField] || 0),
          updated_at:    new Date().toISOString(),
        })
        .eq('user_id', btcProviderId);
      throw new Error(`Failed to create escrow record: ${lockErr.message}`);
    }

    // ── 6. Update trade ────────────────────────────────────────────────────
    const tradeUpdate = {
      status:                'FUNDS_LOCKED',
      escrow_wallet_address: escrowAddress,
      seller_btc_txhash:     lockTxHash,
      escrow_amount:         parsedAmount,
      escrow_locked_at:      new Date().toISOString(),
      expires_at:            new Date(Date.now() + timeLimitMins * 60 * 1000).toISOString(),
      currency,
    };
    if (isUsdt) {
      tradeUpdate.platform_fee_usdt = feeAmount;
    } else {
      tradeUpdate.platform_fee_btc  = feeAmount;
    }

    const { error: tradeUpdateErr } = await supabaseAdmin
      .from('trades').update(tradeUpdate).eq('id', tradeId);
    if (tradeUpdateErr) throw new Error(`Failed to update trade: ${tradeUpdateErr.message}`);

    // ── 7. Audit log ───────────────────────────────────────────────────────
    await this.logTransaction(
      btcProviderId, 'ESCROW_LOCK', parsedAmount, lockTxHash,
      `Funds locked for trade #${tradeId.slice(0,8)}`, currency
    );

    console.log(`✅ Funds locked — ${parsedAmount} ${currency} from provider ${btcProviderId.slice(0,8)}`);

    supabaseAdmin.from('trades')
      .select('seller_id, trade_ref, amount_btc, amount_usdt')
      .eq('id', tradeId).maybeSingle()
      .then(({ data: t }) => {
        if (t?.seller_id) {
          sendTradeAlert(t.seller_id, t, 'new_trade').catch(() => {});
          const amt = isUsdt ? `$${parsedAmount.toFixed(2)} USDT` : `₿${parsedAmount.toFixed(8)}`;
          sendTelegramAlert(t.seller_id, `💰 New trade request! Someone wants to buy ${amt} from you. Trade #${tradeId.slice(0,8).toUpperCase()}`).catch(() => {});
        }
      }).catch(() => {});

    return {
      success:      true,
      escrowAddress,
      lockTxHash,
      amountLocked: parsedAmount,
      currency,
      feeAmount,
      newBalance:   newAvailable,
      expiresAt:    new Date(Date.now() + timeLimitMins * 60 * 1000).toISOString(),
    };
  }

  // ============================================================
  // MARK AS PAID
  // Called when buyer/seller marks payment as sent or received
  // For BTC trades: buyer marks after sending fiat payment
  // For gift card trades: seller marks after sending gift card code
  // ============================================================
  async markAsPaid(tradeId, userId) {
    console.log(`\n💰 markAsPaid — Trade: ${tradeId.slice(0,8)}, User: ${userId.slice(0,8)}`);

    const { data: trade, error } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (error || !trade) throw new Error('Trade not found');

    // Determine if this is a gift card trade
    let listingType = '';
    if (trade.listing_id) {
      const { data: listing } = await supabaseAdmin.from('listings').select('listing_type').eq('id', trade.listing_id).single();
      listingType = listing?.listing_type || '';
    }
    const isGiftCardTrade = listingType.includes('GIFT_CARD');
    
    // Verify authorization
    // For gift card: seller marks as paid (after sending code)
    // For BTC: buyer marks as paid (after sending payment)
    const authorizedId = isGiftCardTrade ? trade.seller_id : trade.buyer_id;
    
    if (String(userId) !== String(authorizedId)) {
      throw new Error(
        isGiftCardTrade 
          ? 'Only the seller can mark as sent (gift card trades)'
          : 'Only the buyer can mark as paid'
      );
    }

    const allowed = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN'];
    if (!allowed.includes(trade.status)) {
      throw new Error(`Cannot mark as paid — trade status is ${trade.status}`);
    }

    await supabaseAdmin
      .from('trades')
      .update({
        status:              'PAYMENT_SENT',
        buyer_confirmed:     true,
        buyer_confirmed_at:  new Date().toISOString(),
        expires_at:          null,
      })
      .eq('id', tradeId);

    // Notify the other party
    const notifyId = isGiftCardTrade ? trade.buyer_id : trade.seller_id;
    const notifyMsg = isGiftCardTrade
      ? `Seller sent the gift card code. Verify and release Bitcoin!`
      : `Buyer confirmed payment. Please verify and release Bitcoin.`;
    
    await this.notify(
      notifyId,
      'trade',
      '✅ Payment/Code Sent',
      notifyMsg,
      `/trade/${tradeId}`
    );
    sendTradeAlert(notifyId, trade, 'payment_sent').catch(() => {});
    // Telegram alert for payment sent
    const isGC = isGiftCardTrade;
    sendTelegramAlert(notifyId, `${isGC ? '🎁' : '💵'} ${isGC ? 'Seller sent the gift card code' : 'Buyer confirmed payment'}! Trade #${tradeId.slice(0,8).toUpperCase()} — please verify and release crypto.`).catch(() => {});

    console.log(`✅ Trade ${tradeId.slice(0,8)} marked as PAYMENT_SENT`);

    return {
      success: true,
      message: 'Payment marked. Waiting for seller to verify and release Bitcoin.',
    };
  }

  // ============================================================
  // RELEASE BITCOIN TO BUYER
  // Called when seller clicks "Release Bitcoin"
  // Splits: (100 - feeRate)% to buyer's PRAQEN wallet + feeRate% to PRAQEN fee wallet
  // This is INTERNAL transfer (balance to balance) — no on-chain TX needed
  // ============================================================
  async releaseBitcoinToBuyer(tradeId, releaserId) {
    const { data: tradeData, error: tradeError } = await supabaseAdmin
        .from('trades')
        .select('*')
        .eq('id', tradeId)
        .single();

    if (tradeError || !tradeData) {
        throw new Error('Trade not found');
    }

    // Detect gift card trade
    let listingType = '';
    if (tradeData.listing_id) {
        const { data: listing } = await supabaseAdmin.from('listings').select('listing_type').eq('id', tradeData.listing_id).single();
        listingType = listing?.listing_type || '';
    }
    // Simple rule: if listing includes GIFT_CARD, buyer (gift card purchaser) provides BTC
    const isGiftCardTrade = listingType.includes('GIFT_CARD');
    // Whoever locked BTC into escrow — seller for BTC trades, buyer for gift card trades
    const btcProviderId = isGiftCardTrade ? tradeData.buyer_id : tradeData.seller_id;



    // Gift card trade: BUYER (Alice, BTC holder) releases after confirming code works
    // BTC trade:       SELLER releases after confirming fiat payment received
    const authorizedId = isGiftCardTrade ? tradeData.buyer_id : tradeData.seller_id;

    console.log(`[release] trade=${tradeId.slice(0,8)} isGiftCard=${isGiftCardTrade} authorizedId=${String(authorizedId).slice(0,8)} releaserId=${String(releaserId).slice(0,8)} status=${tradeData.status}`);

    if (String(authorizedId) !== String(releaserId)) {
        throw new Error(
            isGiftCardTrade
                ? 'Unauthorized — only the card buyer can release Bitcoin'
                : 'Unauthorized — only the seller can release Bitcoin'
        );
    }

    const allowedStatuses = ['PAYMENT_SENT', 'PAID', 'FUNDS_LOCKED', 'DISPUTED'];
    if (!allowedStatuses.includes(tradeData.status)) {
        throw new Error(`Cannot release — trade status is "${tradeData.status}". ${
            isGiftCardTrade ? 'Card seller must send the code first.' : 'Buyer must confirm payment first.'
        }`);
    }

    // Gift card trade: BTC goes to card SELLER (Kenneth)
    // BTC trade:       BTC goes to BTC BUYER
    const btcReceiverId = isGiftCardTrade ? tradeData.seller_id : tradeData.buyer_id;

    if (!btcReceiverId) throw new Error('Cannot determine BTC receiver — trade has no buyer_id/seller_id');
    if (!tradeData.amount_btc || parseFloat(tradeData.amount_btc) <= 0) {
        throw new Error(`Invalid trade amount: ${tradeData.amount_btc}`);
    }

    // Guarantee wallet rows exist for BOTH parties before any balance operation.
    // This prevents the silent-zero bug where UPDATE wallets affects 0 rows because
    // the buyer has never had a wallets row (e.g. first-time buyer).
    await Promise.all([
        ensureWalletExists(btcReceiverId),
        ensureWalletExists(btcProviderId),
    ]);

    // Determine trade currency (default BTC for backwards compatibility)
    const tradeCurrency = (tradeData.currency || 'BTC').toUpperCase();
    const isUsdt        = tradeCurrency === 'USDT';

    const amount      = isUsdt
      ? parseFloat(tradeData.amount_usdt || tradeData.escrow_amount || 0)
      : parseFloat(tradeData.amount_btc);
    const feeRate     = isGiftCardTrade ? 0.02 : 0.01;
    const buyerGets   = parseFloat((amount * (1 - feeRate)).toFixed(isUsdt ? 6 : 8));
    const platformFee = parseFloat((amount * feeRate).toFixed(isUsdt ? 6 : 8));

    console.log(`💰 Releasing ${buyerGets} ${tradeCurrency} → receiver: ${btcReceiverId.slice(0, 8)}`);

    const crypto = require('crypto');
    const releaseTxHash = 'ESCROW_RELEASE_' + crypto
      .createHash('sha256')
      .update(`${tradeId}:${btcReceiverId}:${buyerGets}:${Date.now()}`)
      .digest('hex')
      .slice(0, 32)
      .toUpperCase();

    console.log(`🔓 Release reference: ${releaseTxHash}`);

    // ── Check escrow lock status before crediting ─────────────────────────────
    // We guard the release ourselves (no DB-level atomic RPC is used anymore —
    // see the credit logic below): confirm the lock exists and is releasable
    // before touching any balances.
    const { data: currentLock } = await supabaseAdmin
        .from('escrow_locks')
        .select('id, status')
        .eq('trade_id', tradeId)
        .maybeSingle();

    if (!currentLock) {
        throw new Error('No escrow lock record found for this trade.');
    }
    if (currentLock.status === 'RELEASED') {
        throw new Error('Bitcoin has already been released for this trade.');
    }
    if (currentLock.status === 'REFUNDED') {
        throw new Error('Escrow was refunded (trade cancelled) — cannot release.');
    }
    if (currentLock.status === 'RELEASING') {
        // Stuck from a previous failed attempt — reset to LOCKED so this attempt can claim it
        console.warn(`[Escrow] Lock ${currentLock.id} stuck in RELEASING — resetting to LOCKED for trade ${tradeId.slice(0,8)}`);
        const { error: resetErr } = await supabaseAdmin
            .from('escrow_locks')
            .update({ status: 'LOCKED' })
            .eq('id', currentLock.id);
        if (resetErr) throw new Error(`Failed to reset stuck escrow lock: ${resetErr.message}`);
    }

    // ── Atomically claim the escrow (LOCKED → RELEASING) BEFORE crediting anything ──
    // The status checks above are read-then-branch, not atomic — two concurrent
    // release calls (a retried request racing the original, a double-click, an
    // auto-release racing a manual one) could both pass them and both credit the
    // receiver below. This claim ensures only one caller proceeds past this point.
    const { data: claimedLock } = await supabaseAdmin
        .from('escrow_locks')
        .update({ status: 'RELEASING' })
        .eq('trade_id', tradeId)
        .eq('status', 'LOCKED')
        .select('id');
    if (!claimedLock || claimedLock.length === 0) {
        throw new Error('Escrow release already in progress or completed for this trade.');
    }

    // ── Field names depend on currency ────────────────────────────────────────
    const balField    = isUsdt ? 'balance_usdt'        : 'balance_btc';
    const lockedField = isUsdt ? 'locked_balance_usdt' : 'locked_balance_btc';
    const decimals    = isUsdt ? 6 : 8;
    const symbol      = isUsdt ? '$' : '₿';

    // ── Snapshot BOTH receiver AND company wallet BEFORE credits ──────────────
    const [{ data: receiverBefore }, { data: companyBefore }] = await Promise.all([
        supabaseAdmin.from('wallets').select(balField).eq('user_id', btcReceiverId).maybeSingle(),
        supabaseAdmin.from('wallets').select(balField).eq('user_id', COMPANY_WALLET_ID).maybeSingle(),
    ]);
    const receiverBalanceBefore = parseFloat(receiverBefore?.[balField] || 0);
    const companyBalanceBefore  = parseFloat(companyBefore?.[balField]  || 0);

    if (isUsdt) {
      // ── USDT: skip the BTC-only RPC, apply credits directly ─────────────────
      const newReceiverUsdt = parseFloat((receiverBalanceBefore + buyerGets).toFixed(decimals));
      const { error: creditErr } = await supabaseAdmin
        .from('wallets')
        .update({ [balField]: newReceiverUsdt, updated_at: new Date().toISOString() })
        .eq('user_id', btcReceiverId);
      if (creditErr) throw new Error(`USDT receiver credit failed: ${creditErr.message}`);

      // Fee to company wallet
      const newCompanyUsdt = parseFloat((companyBalanceBefore + platformFee).toFixed(decimals));
      await supabaseAdmin.from('wallets')
        .update({ [balField]: newCompanyUsdt, updated_at: new Date().toISOString() })
        .eq('user_id', COMPANY_WALLET_ID);

      // Mark escrow released + trade completed
      await supabaseAdmin.from('escrow_locks')
        .update({ status: 'RELEASED', released_at: new Date().toISOString() })
        .eq('trade_id', tradeId).eq('status', 'RELEASING');
      await supabaseAdmin.from('trades')
        .update({ status: 'COMPLETED', buyer_btc_txhash: releaseTxHash })
        .eq('id', tradeId);

      console.log(`[Escrow] ✅ USDT credited: ${symbol}${buyerGets.toFixed(decimals)} → receiver ${btcReceiverId.slice(0,8)}`);

    } else {
      // ── BTC: credit the receiver directly ────────────────────────────────────
      // praqen_release_escrow() (the old "atomic" RPC) has a DB-level bug: it always
      // tries to INSERT a wallets row for the receiver even when one already exists,
      // and that INSERT never sets the required private_key column — so it fails
      // with a NOT NULL violation on every call, for every trade type (buy, sell,
      // and gift card all release through this same function). ensureWalletExists()
      // above already guarantees both parties have a wallets row, so a plain credit
      // here is safe and sufficient — we no longer depend on that RPC at all.
      const newReceiverBalance = parseFloat((receiverBalanceBefore + buyerGets).toFixed(8));
      const { error: creditErr } = await supabaseAdmin
        .from('wallets')
        .update({ balance_btc: newReceiverBalance, updated_at: new Date().toISOString() })
        .eq('user_id', btcReceiverId);
      if (creditErr) throw new Error(`BTC receiver credit failed: ${creditErr.message}`);
      syncSecondaryBtcBalance(btcReceiverId, newReceiverBalance);

      const { error: lockErr } = await supabaseAdmin
        .from('escrow_locks')
        .update({ status: 'RELEASED', released_at: new Date().toISOString() })
        .eq('trade_id', tradeId).eq('status', 'RELEASING');
      if (lockErr) console.error(`[Escrow] escrow_locks mark-released failed: ${lockErr.message}`);

      await supabaseAdmin.from('trades')
          .update({
            status:             'COMPLETED',
            buyer_btc_txhash:   releaseTxHash,
            release_tx_hash:    releaseTxHash,
            completed_at:       new Date().toISOString(),
            buyer_received_btc: buyerGets,
          })
          .eq('id', tradeId);

      console.log(`[Escrow] ✅ BTC credited: ₿${buyerGets.toFixed(8)} → receiver ${btcReceiverId.slice(0,8)}`);
    }

    // ── Clear locked balance for the BTC/USDT provider ────────────────────────
    const { data: providerWallet } = await supabaseAdmin
        .from('wallets').select(lockedField).eq('user_id', btcProviderId).maybeSingle();
    const clearedLocked = parseFloat(
        Math.max(0, parseFloat(providerWallet?.[lockedField] || 0) - amount).toFixed(decimals)
    );
    await supabaseAdmin.from('wallets')
        .update({ [lockedField]: clearedLocked, updated_at: new Date().toISOString() })
        .eq('user_id', btcProviderId);

    // Fetch receiver's final balance for return value
    const { data: receiverFinalWallet } = await supabaseAdmin
        .from('wallets').select(balField).eq('user_id', btcReceiverId).maybeSingle();
    const newReceiverBalance = parseFloat(receiverFinalWallet?.[balField] || 0);

    // ── Collect platform fee (BTC only — USDT fee already credited above) ─────
    if (!isUsdt) {
      try {
        console.log(`💸 Collecting ${(feeRate * 100)}% fee: ₿${platformFee.toFixed(8)} → company wallet`);

        const { data: companyAfterRpc } = await supabaseAdmin
            .from('wallets').select('balance_btc').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
        const companyBalanceAfterRpc = parseFloat(companyAfterRpc?.balance_btc || 0);
        const rpcCreditedCompany = (companyBalanceAfterRpc - companyBalanceBefore) >= platformFee * 0.99;

        if (rpcCreditedCompany) {
            console.log(`✅ Fee already credited by RPC: ₿${platformFee.toFixed(8)} (company: ${companyBalanceAfterRpc.toFixed(8)} BTC)`);
        } else {
            const newCompanyBalance = parseFloat((companyBalanceAfterRpc + platformFee).toFixed(8));
            const { error: feeUpdateErr } = await supabaseAdmin
                .from('wallets')
                .update({ balance_btc: newCompanyBalance, updated_at: new Date().toISOString() })
                .eq('user_id', COMPANY_WALLET_ID);
            if (feeUpdateErr) throw new Error(`Company wallet update failed: ${feeUpdateErr.message}`);
            console.log(`✅ Fee manually credited: ₿${platformFee.toFixed(8)} → company`);
        }

        await supabaseAdmin.from('wallet_transactions').insert({
            user_id:    COMPANY_WALLET_ID,
            type:       'FEE',
            amount_btc: platformFee,
            currency:   'BTC',
            status:     'CONFIRMED',
            tx_hash:    `${releaseTxHash}_FEE`,
            notes:      `Platform fee from trade ${tradeId.slice(0, 8).toUpperCase()} — ${(feeRate * 100)}% of ₿${amount.toFixed(8)}`,
            created_at: new Date().toISOString(),
        }).then(() => {}).catch(e => console.warn('[Escrow] FEE tx log failed (non-critical):', e.message));

        await supabaseAdmin.from('company_profits').upsert({
            trade_id:     tradeId,
            profit_btc:   platformFee,
            profit_usd:   parseFloat(((platformFee) * (parseFloat(tradeData.amount_usd || 0) / amount)).toFixed(2)),
            status:       'COLLECTED',
            collected_at: new Date().toISOString(),
        }, { onConflict: 'trade_id', ignoreDuplicates: true }).then(() => {}).catch(() => {});

        await supabaseAdmin.from('trades')
            .update({ fee_status: 'COLLECTED', fee_collected_at: new Date().toISOString(), platform_fee_btc: platformFee })
            .eq('id', tradeId);

        console.log(`✅ Fee CONFIRMED: ₿${platformFee.toFixed(8)} (${(feeRate * 100)}%) from trade ${tradeId.slice(0, 8).toUpperCase()}`);

      } catch (feeErr) {
          console.error(`🚨 [Escrow] FEE COLLECTION FAILED — ₿${platformFee.toFixed(8)} NOT COLLECTED:`, feeErr.message);
          await supabaseAdmin.from('trades')
              .update({ fee_status: 'FAILED', platform_fee_btc: platformFee })
              .eq('id', tradeId).then(null, () => {});
      }
    } else {
      // USDT fee audit trail
      await supabaseAdmin.from('wallet_transactions').insert({
          user_id:     COMPANY_WALLET_ID,
          type:        'FEE',
          amount_usdt: platformFee,
          currency:    'USDT',
          status:      'CONFIRMED',
          tx_hash:     `${releaseTxHash}_FEE`,
          notes:       `USDT fee from trade ${tradeId.slice(0,8).toUpperCase()} — ${(feeRate*100)}% of $${amount.toFixed(2)}`,
          created_at:  new Date().toISOString(),
      }).then(() => {}).catch(() => {});

      await supabaseAdmin.from('company_profits').upsert({
          trade_id:     tradeId,
          profit_usdt:  platformFee,
          profit_usd:   platformFee,
          status:       'COLLECTED',
          collected_at: new Date().toISOString(),
      }, { onConflict: 'trade_id', ignoreDuplicates: true }).then(() => {}).catch(() => {});

      await supabaseAdmin.from('trades')
          .update({ fee_status: 'COLLECTED', fee_collected_at: new Date().toISOString(), platform_fee_usdt: platformFee })
          .eq('id', tradeId);

      console.log(`✅ USDT Fee CONFIRMED: $${platformFee.toFixed(2)} (${(feeRate*100)}%) from trade ${tradeId.slice(0,8).toUpperCase()}`);
    }

    // ── Re-evaluate offer status for the BTC provider after balance change ──
    updateOfferStatus(btcProviderId).catch(() => {});

    // ── Award badges to both participants (fire and forget) ────────────────
    checkAndAwardBadges(tradeData.seller_id).catch(() => {});
    checkAndAwardBadges(tradeData.buyer_id).catch(() => {});

    // ── Log transaction for receiver ───────────────────────────────────────
    await this.logTransaction(
        btcReceiverId, 'ESCROW_RELEASE', buyerGets, releaseTxHash,
        `Trade #${tradeId.slice(0, 8)} completed — ${symbol}${buyerGets.toFixed(decimals)} received`,
        tradeCurrency
    );

    // Audit log (fire-and-forget)
    supabaseAdmin.from('balance_audit').insert({
      user_id:     btcReceiverId,
      change_btc:  isUsdt ? 0 : buyerGets,
      new_balance: newReceiverBalance,
      reason:      'ESCROW_RELEASE',
      trade_id:    tradeId,
      created_at:  new Date().toISOString(),
    }).then(() => {}).catch(() => {});

    // ── Notify both parties ────────────────────────────────────────────────
    const amtDisplay = isUsdt ? `$${buyerGets.toFixed(2)} USDT` : `₿${buyerGets.toFixed(8)}`;
    await this.notify(
        btcReceiverId, 'trade', '🎉 Funds Released!',
        `Trade #${tradeId.slice(0, 8).toUpperCase()} complete! ${amtDisplay} added to your wallet.`,
        `/trade/${tradeId}`
    );
    await this.notify(
        releaserId, 'trade', '✅ Trade Complete',
        `Trade #${tradeId.slice(0, 8).toUpperCase()} completed successfully. ${amtDisplay} released to buyer.`,
        `/trade/${tradeId}`
    );
    sendTradeAlert(btcReceiverId, tradeData, 'btc_released').catch(() => {});
    sendTradeAlert(releaserId, tradeData, 'btc_released').catch(() => {});
    // Telegram alerts for escrow release
    const releaseAmtDisplay = isUsdt ? `$${buyerGets.toFixed(2)} USDT` : `₿${buyerGets.toFixed(8)}`;
    sendTelegramAlert(btcReceiverId, `✅ Trade completed! You received ${releaseAmtDisplay} — Trade #${tradeId.slice(0,8).toUpperCase()}`).catch(() => {});
    sendTelegramAlert(releaserId, `✅ Trade #${tradeId.slice(0,8).toUpperCase()} completed — ${releaseAmtDisplay} released to buyer.`).catch(() => {});

    console.log(`✅ Trade ${tradeId.slice(0, 8)} COMPLETED — receiver got ${amtDisplay} | fee ${symbol}${platformFee.toFixed(decimals)} → company`);

    return {
        success:          true,
        txHash:           releaseTxHash,
        amountReceived:   buyerGets,
        currency:         tradeCurrency,
        platformFee:      platformFee,
        receiverBalance:  newReceiverBalance,
        // keep btcReceived for backwards-compat with existing frontend checks
        btcReceived:      isUsdt ? 0 : buyerGets,
    };
  }

  // ============================================================
  // CANCEL TRADE — refund BTC provider
  // Called by buyer cancel, auto-cancel, or dispute resolution
  // ============================================================
  // actorId: the user who clicked "Cancel", if this was a manual cancellation
  // (omitted for the auto-expiry cron and the timeout-triggered auto-cancel route)
  // skipNotify: true when the caller (e.g. resolveDispute) will send its own,
  // more accurate notification — avoids the user getting both a "Trade
  // Cancelled" AND a "Dispute Resolved" notification for the same event
  async cancelTrade(tradeId, reason, actorId = null, skipNotify = false) {
    console.log(`\n❌ cancelTrade — Trade: ${tradeId.slice(0,8)}, Reason: ${reason}`);

    // ── 1. Fetch trade ────────────────────────────────────────────────────────
    const { data: preTrade, error } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (error || !preTrade) throw new Error('Trade not found');

    const cancellable = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN', 'PAYMENT_SENT', 'DISPUTED'];
    if (!cancellable.includes(preTrade.status)) {
      return { success: false, message: `Trade cannot be cancelled — status is ${preTrade.status}` };
    }

    // ── 1b. Atomically claim the TRADE itself for cancellation ─────────────────
    // Idempotency guard against duplicate refunds. The escrow_locks claim below
    // (LOCKED→REFUNDING) only protects trades that have an escrow_locks row —
    // trades that fall back to trade.escrow_amount/trade.amount_btc (no lock row)
    // had NO concurrency protection at all, so two near-simultaneous callers
    // (e.g. a user's manual cancel racing the 60s auto-expiry cron, or a dispute
    // resolution firing at the same moment) could both sail past that guard and
    // both credit the refund. Claiming here, at the trade level, closes that gap
    // for every refund path: only one concurrent caller can flip a cancellable
    // status → CANCELLING; every other caller sees 0 rows updated and bails out.
    const { data: claimedTrades, error: claimTradeErr } = await supabaseAdmin
      .from('trades')
      .update({ status: 'CANCELLING' })
      .eq('id', tradeId)
      .in('status', cancellable)
      .select('*');

    if (claimTradeErr) throw new Error(`Failed to claim trade for cancellation: ${claimTradeErr.message}`);
    if (!claimedTrades || claimedTrades.length === 0) {
      console.warn(`[cancelTrade] Trade ${tradeId.slice(0,8)} already claimed/cancelled by another process — skipping duplicate refund`);
      return { success: false, message: 'This trade was already cancelled or resolved.' };
    }
    const trade = claimedTrades[0];

    // ── 2. Recover any lock stuck in REFUNDING from a previous failed cancel ──
    // Mirrors the RELEASING recovery in releaseBitcoinToBuyer.
    // If a prior cancel attempt set status=REFUNDING but then crashed, the atomic
    // claim below (WHERE status='LOCKED') would silently match nothing and the
    // refund would never run. We reset it to LOCKED so this attempt can claim it.
    const { data: lockCheck } = await supabaseAdmin
      .from('escrow_locks')
      .select('id, status')
      .eq('trade_id', tradeId)
      .maybeSingle();

    if (lockCheck?.status === 'REFUNDING') {
      console.warn(`[cancelTrade] Lock ${lockCheck.id} stuck in REFUNDING for trade ${tradeId.slice(0,8)} — resetting to LOCKED`);
      const { error: resetErr } = await supabaseAdmin
        .from('escrow_locks')
        .update({ status: 'LOCKED' })
        .eq('id', lockCheck.id);
      if (resetErr) throw new Error(`Failed to reset stuck escrow lock: ${resetErr.message}`);
    }

    // ── 3. Atomically claim the escrow (UPDATE WHERE status='LOCKED') ─────────
    // Only one concurrent request can flip LOCKED→REFUNDING — prevents double-refund
    // if a manual cancel and the auto-cancel cron fire at the same instant.
    const { data: claimedEscrow } = await supabaseAdmin
      .from('escrow_locks')
      .update({ status: 'REFUNDING', released_at: new Date().toISOString() })
      .eq('trade_id', tradeId)
      .eq('status', 'LOCKED')
      .select('*');

    // A lock row existed but we didn't win the claim — another concurrent call
    // (the exact manual-cancel-vs-auto-cancel-cron race this claim exists to
    // stop) already grabbed it. Bail out instead of refunding a second time.
    // lockCheck being null (no escrow row at all) is the legitimate fallback
    // case below and must still proceed.
    if (lockCheck && (!claimedEscrow || claimedEscrow.length === 0)) {
      console.warn(`[cancelTrade] Escrow lock for trade ${tradeId.slice(0,8)} already claimed by another process — skipping duplicate refund`);
      return { success: false, message: 'This trade was already cancelled or resolved.' };
    }

    // ── 4. Determine who gets the refund ──────────────────────────────────────
    // escrow_locks.seller_id is set to btcProviderId at lock time — always the
    // ground truth. The fallback matters only when no escrow record exists (e.g.
    // the lock step failed at trade creation).
    //
    // Fallback rule (must match lockFundsInEscrow logic in server.js):
    //   • Standard BTC trades (SELL / BUY listing):  btcProvider = trade.seller_id
    //   • Gift card trades (BUY_GIFT_CARD / SELL_GIFT_CARD): btcProvider = trade.buyer_id
    //     because for gift card trades the *buyer* role holds the BTC, not the seller.
    const esc            = (await supabaseAdmin.from('escrow_locks').select('*').eq('trade_id', tradeId).maybeSingle()).data;
    const escCurrency    = (esc?.currency || trade.currency || 'BTC').toUpperCase();
    const isUsdtRefund   = escCurrency === 'USDT';
    const refundAmount   = isUsdtRefund
      ? parseFloat(esc?.amount_usdt || trade.amount_usdt || trade.escrow_amount || 0)
      : parseFloat(esc?.amount_btc  || trade.escrow_amount || trade.amount_btc  || 0);

    let fallbackBtcProvider = trade.seller_id;
    if (!esc?.seller_id && trade.listing_id) {
      const { data: listing } = await supabaseAdmin
        .from('listings').select('listing_type').eq('id', trade.listing_id).maybeSingle();
      const lType = (listing?.listing_type || '').toUpperCase();
      if (lType === 'BUY_GIFT_CARD' || lType === 'SELL_GIFT_CARD') {
        fallbackBtcProvider = trade.buyer_id;
      }
    }
    const btcProviderId = esc?.seller_id || fallbackBtcProvider;

    console.log(`[cancelTrade] refundAmount=₿${refundAmount} btcProvider=${btcProviderId?.slice(0,8)} escrow=${esc?.status || 'none'}`);

    // ── 5. Refund the provider (BTC or USDT) ─────────────────────────────────
    if (refundAmount > 0 && btcProviderId) {
      await ensureWalletExists(btcProviderId);

      const refundBalField    = isUsdtRefund ? 'balance_usdt'        : 'balance_btc';
      const refundLockedField = isUsdtRefund ? 'locked_balance_usdt' : 'locked_balance_btc';
      const refundDecimals    = isUsdtRefund ? 6 : 8;
      const refundSymbol      = isUsdtRefund ? '$' : '₿';

      if (isUsdtRefund) {
        // ── USDT refund: skip BTC-only RPC, apply directly ─────────────────
        const { data: pBal } = await supabaseAdmin
          .from('wallets').select(`${refundBalField}, ${refundLockedField}`).eq('user_id', btcProviderId).maybeSingle();
        const manualAvail  = parseFloat((parseFloat(pBal?.[refundBalField]  || 0) + refundAmount).toFixed(refundDecimals));
        const manualLocked = parseFloat(Math.max(0, parseFloat(pBal?.[refundLockedField] || 0) - refundAmount).toFixed(refundDecimals));
        const { error: refundErr } = await supabaseAdmin
          .from('wallets')
          .update({ [refundBalField]: manualAvail, [refundLockedField]: manualLocked, updated_at: new Date().toISOString() })
          .eq('user_id', btcProviderId);
        if (refundErr) throw new Error(`USDT refund failed: ${refundErr.message}`);
        console.log(`[cancelTrade] ✅ USDT refund: $${manualAvail.toFixed(refundDecimals)} USDT → provider ${btcProviderId.slice(0,8)}`);

      } else {
        // ── BTC refund: use existing RPC with JS-side verification ─────────
        const { data: providerBefore } = await supabaseAdmin
          .from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', btcProviderId).maybeSingle();
        const balanceBefore = parseFloat(providerBefore?.balance_btc || 0);

        const { error: refundErr } = await supabaseAdmin.rpc('praqen_refund_escrow', {
          p_trade_id:    tradeId,
          p_provider_id: btcProviderId,
          p_amount_btc:  refundAmount,
          p_reason:      reason || 'Trade cancelled',
        });

        if (refundErr) {
          console.warn(`[cancelTrade] praqen_refund_escrow RPC failed (${refundErr.message}) — applying manual refund`);
          const { data: pBal } = await supabaseAdmin
            .from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', btcProviderId).maybeSingle();
          const manualAvail  = parseFloat((parseFloat(pBal?.balance_btc  || 0) + refundAmount).toFixed(8));
          const manualLocked = parseFloat(Math.max(0, parseFloat(pBal?.locked_balance_btc || 0) - refundAmount).toFixed(8));
          const { error: manualErr } = await supabaseAdmin.from('wallets')
            .update({ balance_btc: manualAvail, locked_balance_btc: manualLocked, updated_at: new Date().toISOString() })
            .eq('user_id', btcProviderId);
          if (manualErr) throw new Error(`Manual refund failed: ${manualErr.message}`);
          console.log(`[cancelTrade] ✅ Manual BTC refund: ₿${manualAvail.toFixed(8)} → provider ${btcProviderId.slice(0,8)}`);
          syncSecondaryBtcBalance(btcProviderId, manualAvail);

        } else {
          const { data: providerAfter } = await supabaseAdmin
            .from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', btcProviderId).maybeSingle();
          const balanceAfter = parseFloat(providerAfter?.balance_btc || 0);
          const rpcCredited  = balanceAfter - balanceBefore;

          if (rpcCredited < refundAmount * 0.99) {
            console.warn(`[cancelTrade] RPC credited ₿${rpcCredited.toFixed(8)} expected ₿${refundAmount.toFixed(8)} — correcting`);
            const correctedBalance = parseFloat((balanceAfter + (refundAmount - rpcCredited)).toFixed(8));
            const syncedLocked     = parseFloat(Math.max(0, parseFloat(providerAfter?.locked_balance_btc || 0) - refundAmount).toFixed(8));
            const { error: fixErr } = await supabaseAdmin.from('wallets')
              .update({ balance_btc: correctedBalance, locked_balance_btc: syncedLocked, updated_at: new Date().toISOString() })
              .eq('user_id', btcProviderId);
            if (fixErr) throw new Error(`Balance correction failed: ${fixErr.message}`);
            console.log(`[cancelTrade] ✅ BTC balance corrected: ₿${correctedBalance.toFixed(8)} → provider ${btcProviderId.slice(0,8)}`);
            syncSecondaryBtcBalance(btcProviderId, correctedBalance);
          } else {
            const syncedLocked = parseFloat(Math.max(0, parseFloat(providerAfter?.locked_balance_btc || 0) - refundAmount).toFixed(8));
            await supabaseAdmin.from('wallets')
              .update({ locked_balance_btc: syncedLocked, updated_at: new Date().toISOString() })
              .eq('user_id', btcProviderId);
            console.log(`[cancelTrade] ✅ BTC RPC credited: ₿${rpcCredited.toFixed(8)} → provider ${btcProviderId.slice(0,8)}`);
            syncSecondaryBtcBalance(btcProviderId, balanceAfter);
          }
        }
      }

      // ── Audit log ─────────────────────────────────────────────────────────
      await this.logTransaction(
        btcProviderId, 'ESCROW_REFUND', refundAmount, null,
        `Trade #${tradeId.slice(0,8)} cancelled — ${refundSymbol}${refundAmount.toFixed(refundDecimals)} ${escCurrency} refunded`,
        escCurrency
      );

      supabaseAdmin.from('wallets').select(refundBalField).eq('user_id', btcProviderId).maybeSingle()
        .then(({ data: final }) => {
          supabaseAdmin.from('balance_audit').insert({
            user_id:     btcProviderId,
            change_btc:  isUsdtRefund ? 0 : refundAmount,
            new_balance: parseFloat(final?.[refundBalField] || 0),
            reason:      'ESCROW_REFUND',
            trade_id:    tradeId,
            created_at:  new Date().toISOString(),
          }).then(null, () => {});
        }).catch(() => {});

      sendSystemAlert(
        btcProviderId,
        '💸 Escrow Refunded',
        `Trade #${tradeId.slice(0,8).toUpperCase()} cancelled — ${refundSymbol}${refundAmount.toFixed(refundDecimals)} ${escCurrency} returned to your wallet.`,
        'https://praqen.com/wallet'
      ).catch(err => console.error('[Escrow] Refund push error:', err.message));

      console.log(`[cancelTrade] ✅ Refund complete: ${refundSymbol}${refundAmount} ${escCurrency} → provider ${btcProviderId.slice(0,8)}`);

    } else {
      console.log(`[cancelTrade] No escrow funds to refund for trade ${tradeId.slice(0,8)}`);
    }

    // ── 6. Mark trade CANCELLED ───────────────────────────────────────────────
    await supabaseAdmin
      .from('trades')
      .update({
        status:        'CANCELLED',
        cancel_reason: reason || 'Trade cancelled',
        cancelled_at:  new Date().toISOString(),
      })
      .eq('id', tradeId);

    // ── 7. Notify both parties (with direction + counterparty for card display) ─
    // "Expired" (auto-cancel after the payment window closed) reads very
    // differently to a user than "Cancelled" (someone actually clicked cancel) —
    // the trades table only ever stores status=CANCELLED for both, so this is
    // the one place that decides which the user actually sees.
    // Skipped entirely when resolveDispute() is the caller — it sends its own
    // "Dispute Resolved" notification right after this returns, and firing both
    // meant the user saw a misleading "Trade Cancelled" alert for a trade that
    // (for SELLER_WINS) actually ends up marked COMPLETED.
    if (!skipNotify) {
      const isExpiry = /expir|time limit|payment window/i.test(reason || '');
      const notifTitle = isExpiry ? '⏰ Trade Expired' : '❌ Trade Cancelled';
      const notifType  = isExpiry ? 'trade_expire' : 'trade_cancel';
      const ref = `#${tradeId.slice(0,8).toUpperCase()}`;

      let actorName = null;
      if (actorId) {
        const { data: actor } = await supabaseAdmin.from('users').select('username').eq('id', actorId).maybeSingle();
        actorName = actor?.username || 'Trader';
      }

      const buildMsg = (forUserId) => {
        if (isExpiry) return `Trade ${ref} expired — the payment window closed and any locked funds were refunded.`;
        if (actorId && forUserId === actorId) return `You cancelled trade ${ref}.${reason ? ` ${reason}` : ''}`;
        if (actorId) return `${actorName} cancelled trade ${ref}.${reason ? ` ${reason}` : ''}`;
        return `Trade ${ref} cancelled.${reason ? ` ${reason}` : ''}`;
      };

      if (trade.buyer_id) {
        await this.notify(trade.buyer_id, notifType, notifTitle,
          buildMsg(trade.buyer_id), `/trade/${tradeId}`,
          { actor_id: actorId || trade.seller_id, direction: 'buy', trade_id: tradeId });
      }
      if (trade.seller_id) {
        await this.notify(trade.seller_id, notifType, notifTitle,
          buildMsg(trade.seller_id), `/trade/${tradeId}`,
          { actor_id: actorId || trade.buyer_id, direction: 'sell', trade_id: tradeId });
      }
      // Push to the party who did NOT get the refund alert above (btcProviderId already got sendSystemAlert)
      const otherPartyId = btcProviderId === trade.buyer_id ? trade.seller_id : trade.buyer_id;
      if (otherPartyId) sendTradeAlert(otherPartyId, trade, 'trade_cancelled').catch(() => {});
      // Telegram alert for trade cancel/expiry
      const cancelRef = `#${tradeId.slice(0,8).toUpperCase()}`;
      [trade.buyer_id, trade.seller_id].filter(Boolean).forEach(uid => {
        sendTelegramAlert(uid, `${isExpiry ? '⏰' : '❌'} Trade ${cancelRef} ${isExpiry ? 'expired' : 'cancelled'}. ${isExpiry ? 'Payment window closed and funds refunded.' : ''}`.trim()).catch(() => {});
      });
    }

    console.log(`✅ Trade ${tradeId.slice(0,8)} cancelled and closed`);

    // ── 8. Re-evaluate offer status now that the provider's balance is restored ─
    if (btcProviderId) updateOfferStatus(btcProviderId).catch(() => {});

    return {
      success: true,
      message: `Trade cancelled. ${refundAmount > 0 ? 'Funds returned to wallet.' : ''}`,
    };
  }

  // ============================================================
  // CANCEL EXPIRED TRADE (auto-cancel)
  // Called by timer or manual trigger
  // ============================================================
  async cancelExpiredTrade(tradeId) {
    return this.cancelTrade(tradeId, 'Trade expired — time limit reached');
  }

  // ============================================================
  // PROCESS ALL EXPIRED TRADES
  // Called by a cron job or on server startup
  // ============================================================
  async processExpiredTrades() {
    // NOTE: PAYMENT_SENT is intentionally excluded — buyer may have already sent
    // fiat payment and auto-cancelling would refund the seller unfairly.
    // 5-minute grace buffer: only cancel trades that expired MORE than 5 minutes ago.
    // This gives buyers who paid just before the timer ended a window to click "Mark Paid".
    const graceDeadline = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: expired, error } = await supabaseAdmin
      .from('trades')
      .select('id')
      .in('status', ['CREATED', 'FUNDS_LOCKED'])
      .lt('expires_at', graceDeadline);

    if (error || !expired || expired.length === 0) return 0;

    console.log(`[Escrow] Processing ${expired.length} expired trades...`);

    let count = 0;
    for (const t of expired) {
      try {
        await this.cancelExpiredTrade(t.id);
        count++;
        console.log(`✅ [Escrow] Trade ${t.id.slice(0,8)} auto-cancelled`);
      } catch (e) {
        console.error(`[Escrow] Failed to cancel ${t.id.slice(0,8)}:`, e.message);
      }
    }

    return count;
  }

  // ============================================================
  // DISPUTE RESOLUTION
  // Called by moderator — either buyer wins or seller wins
  // ============================================================
  async resolveDispute(tradeId, resolution, moderatorId, notes) {
    console.log(`\n👨‍⚖️ resolveDispute — Trade: ${tradeId.slice(0,8)}, Resolution: ${resolution}`);

    const { data: trade } = await supabaseAdmin
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (!trade) throw new Error('Trade not found');
    if (trade.dispute_resolution) throw new Error('Dispute already resolved');

    if (resolution === 'BUYER_WINS') {
      // Release to buyer — same as normal release
      await this.releaseBitcoinToBuyer(tradeId, trade.seller_id);

      await supabaseAdmin.from('trades').update({
        dispute_resolution: 'BUYER_WINS',
        dispute_notes:      notes,
        resolved_by:        moderatorId,
        resolved_at:        new Date().toISOString(),
      }).eq('id', tradeId);

    } else if (resolution === 'SELLER_WINS') {
      // Refund to seller — same as cancel. skipNotify=true: the trade ends up
      // COMPLETED (see status update below), so cancelTrade's own "Trade
      // Cancelled" notification would be wrong — the caller sends "Dispute
      // Resolved" instead.
      const sellerWinsResult = await this.cancelTrade(tradeId, `Dispute resolved — SELLER WINS. ${notes || ''}`, null, true);
      if (!sellerWinsResult?.success) {
        throw new Error(`Escrow refund failed for SELLER_WINS: ${sellerWinsResult?.message || 'unknown error'}`);
      }

      await supabaseAdmin.from('trades').update({
        status:             'COMPLETED',
        dispute_resolution: 'SELLER_WINS',
        dispute_notes:      notes,
        resolved_by:        moderatorId,
        resolved_at:        new Date().toISOString(),
      }).eq('id', tradeId);

    } else if (resolution === 'CANCEL') {
      // Refund BTC to seller (whoever locked it), mark as CANCELLED.
      // skipNotify=true — the caller sends "Dispute Resolved" instead.
      const cancelResult = await this.cancelTrade(tradeId, `Dispute resolved — CANCELLED by moderator. ${notes || ''}`, null, true);
      if (!cancelResult?.success) {
        throw new Error(`Escrow refund failed for CANCEL resolution: ${cancelResult?.message || 'unknown error'}`);
      }

      await supabaseAdmin.from('trades').update({
        status:             'CANCELLED',
        dispute_resolution: 'CANCEL',
        dispute_notes:      notes,
        resolved_by:        moderatorId,
        resolved_at:        new Date().toISOString(),
      }).eq('id', tradeId);

    } else {
      throw new Error(`Unknown resolution: ${resolution}. Use BUYER_WINS, SELLER_WINS, or CANCEL`);
    }

    console.log(`✅ Dispute resolved: ${resolution}`);
    return { success: true, resolution, tradeId };
  }

  // ── Update trade stats for a user ─────────────────────────────────────────
  async updateTradeStats(userId) {
    try {
      const { data: all } = await supabaseAdmin
        .from('trades')
        .select('status')
        .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);

      const completed = (all || []).filter(t => t.status === 'COMPLETED').length;
      const rate      = all?.length > 0 ? Math.round((completed / all.length) * 100) : 100;

      // Never let total_trades go down — preserve historical trade counts
      const { data: cur } = await supabaseAdmin.from('users').select('total_trades').eq('id', userId).single();
      const newTotal = Math.max(parseInt(cur?.total_trades || 0), completed);

      await supabaseAdmin
        .from('users')
        .update({ total_trades: newTotal, completion_rate: rate })
        .eq('id', userId);
    } catch (e) {
      console.error('[Escrow] updateTradeStats error:', e.message);
    }
  }

  // ── Handle affiliate commission ────────────────────────────────────────────
  async createAffiliateEarning(tradeId, buyerId, amountBtc) {
    try {
      const { data: buyer } = await supabaseAdmin
        .from('users').select('referred_by').eq('id', buyerId).single();
      if (!buyer?.referred_by) return;

      const { data: referrer } = await supabaseAdmin
        .from('users').select('total_referrals').eq('id', buyer.referred_by).single();

      let rate = 0.1;
      const count = referrer?.total_referrals || 0;
      if (count >= 100) rate = 0.3;
      else if (count >= 50) rate = 0.25;
      else if (count >= 25) rate = 0.2;
      else if (count >= 10) rate = 0.15;

      const commissionBtc = parseFloat(amountBtc) * (rate / 100);

      await supabaseAdmin.from('affiliate_earnings').insert({
        referrer_id:       buyer.referred_by,
        referred_user_id:  buyerId,
        trade_id:          tradeId,
        commission_btc:    commissionBtc,
        trade_amount_btc:  amountBtc,
        commission_rate:   rate,
        status:            'COMPLETED',
        created_at:        new Date().toISOString(),
      });

      console.log(`✅ [Escrow] Affiliate: ${commissionBtc.toFixed(8)} BTC to ${buyer.referred_by.slice(0,8)}`);
    } catch (e) {
      console.error('[Escrow] Affiliate error:', e.message);
    }
  }

  // ── Hold a suspicious/erroneous BTC credit ────────────────────────────────
  // For a credit that shouldn't be spendable yet (a duplicate deposit, a system
  // miscredit) — moves the flagged amount from balance_btc into
  // locked_balance_btc using the same optimistic-concurrency pattern as
  // lockFundsInEscrow, so the user immediately loses the ability to send,
  // withdraw, or trade it (every spend path only ever checks balance_btc,
  // which already excludes locked funds) without it silently vanishing —
  // it still shows in their wallet as held, and they're notified why.
  async holdSuspiciousBtc(userId, amountBtc, reason, adminId) {
    const amount = parseFloat(amountBtc);
    if (!amount || amount <= 0) throw new Error('Invalid hold amount');

    const { data: walletRow, error: wErr } = await supabaseAdmin
      .from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', userId).single();
    if (wErr || !walletRow) throw new Error('Wallet not found');

    const currentBalance = parseFloat(walletRow.balance_btc || 0);
    if (currentBalance < amount) {
      throw new Error(`User only has ₿${currentBalance.toFixed(8)} available — cannot hold ₿${amount.toFixed(8)}`);
    }
    const currentLocked = parseFloat(walletRow.locked_balance_btc || 0);
    const newAvailable  = parseFloat((currentBalance - amount).toFixed(8));
    const newLocked     = parseFloat((currentLocked + amount).toFixed(8));

    const { data: claimed, error: updErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_btc: newAvailable, locked_balance_btc: newLocked, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('balance_btc', currentBalance)
      .eq('locked_balance_btc', currentLocked)
      .select('user_id');
    if (updErr) throw new Error(`Failed to place hold: ${updErr.message}`);
    if (!claimed || claimed.length === 0) {
      throw new Error('Balance changed while placing the hold — please retry.');
    }

    syncSecondaryBtcBalance(userId, newAvailable);

    await supabaseAdmin.from('balance_audit').insert({
      user_id:     userId,
      change_btc:  -amount,
      new_balance: newAvailable,
      reason:      `ADMIN_HOLD: ${reason || 'Suspicious credit under review'}`,
      created_at:  new Date().toISOString(),
    }).catch(() => {});

    await supabaseAdmin.from('notifications').insert({
      user_id: userId, type: 'security', title: '🔒 Balance Under Review',
      message: `₿${amount.toFixed(8)} of your balance has been placed on hold pending review${reason ? `: ${reason}` : '.'} It stays in your wallet and is not lost — you just can't send or withdraw it until the review is complete. Contact support@praqen.com with questions.`,
      action: '/wallet', is_read: false, created_at: new Date().toISOString(),
    }).catch(() => {});

    console.log(`🔒 [Escrow] Hold placed: ₿${amount.toFixed(8)} on user ${userId.slice(0,8)} by admin ${adminId ? adminId.slice(0,8) : 'system'} — ${reason}`);
    return { success: true, heldAmount: amount, newAvailable, newLocked };
  }

  // ── Resolve a hold placed by holdSuspiciousBtc ─────────────────────────────
  // action: 'RELEASE' returns the held amount to balance_btc (hold was a false
  // alarm — the user keeps it). 'CLAWBACK' removes it permanently — it was a
  // real system error and is gone for good, no longer counted anywhere in the
  // user's balance.
  async resolveSuspiciousHold(userId, amountBtc, action, adminId, note) {
    const amount = parseFloat(amountBtc);
    if (!amount || amount <= 0) throw new Error('Invalid amount');
    if (!['RELEASE', 'CLAWBACK'].includes(action)) throw new Error('action must be RELEASE or CLAWBACK');

    const { data: walletRow, error: wErr } = await supabaseAdmin
      .from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', userId).single();
    if (wErr || !walletRow) throw new Error('Wallet not found');

    const currentBalance = parseFloat(walletRow.balance_btc || 0);
    const currentLocked  = parseFloat(walletRow.locked_balance_btc || 0);
    if (currentLocked < amount) {
      throw new Error(`Only ₿${currentLocked.toFixed(8)} is currently held — cannot resolve ₿${amount.toFixed(8)}`);
    }

    const newLocked    = parseFloat((currentLocked - amount).toFixed(8));
    const newAvailable = action === 'RELEASE'
      ? parseFloat((currentBalance + amount).toFixed(8))
      : currentBalance; // CLAWBACK: the held amount just disappears; available is untouched

    const { data: claimed, error: updErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_btc: newAvailable, locked_balance_btc: newLocked, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('balance_btc', currentBalance)
      .eq('locked_balance_btc', currentLocked)
      .select('user_id');
    if (updErr) throw new Error(`Failed to resolve hold: ${updErr.message}`);
    if (!claimed || claimed.length === 0) {
      throw new Error('Balance changed while resolving the hold — please retry.');
    }

    syncSecondaryBtcBalance(userId, newAvailable);

    await supabaseAdmin.from('balance_audit').insert({
      user_id:     userId,
      change_btc:  action === 'RELEASE' ? amount : -amount,
      new_balance: newAvailable,
      reason:      `ADMIN_HOLD_${action}: ${note || ''}`.trim(),
      created_at:  new Date().toISOString(),
    }).catch(() => {});

    await supabaseAdmin.from('notifications').insert({
      user_id: userId, type: 'security',
      title: action === 'RELEASE' ? '✅ Hold Released' : '⚠️ Balance Correction Applied',
      message: action === 'RELEASE'
        ? `The ₿${amount.toFixed(8)} hold on your balance has been cleared and is available again.${note ? ` ${note}` : ''}`
        : `₿${amount.toFixed(8)} has been permanently removed from your balance — it was credited in error and did not belong to you.${note ? ` Reason: ${note}` : ''} Contact support@praqen.com with questions.`,
      action: '/wallet', is_read: false, created_at: new Date().toISOString(),
    }).catch(() => {});

    console.log(`${action === 'RELEASE' ? '✅' : '⚠️'} [Escrow] Hold resolved (${action}): ₿${amount.toFixed(8)} for user ${userId.slice(0,8)} by admin ${adminId ? adminId.slice(0,8) : 'system'}`);
    return { success: true, action, amount, newAvailable, newLocked };
  }
}

module.exports = new TradeEscrowService();