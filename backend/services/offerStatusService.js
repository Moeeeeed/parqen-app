// services/offerStatusService.js
// Keeps offer visibility in sync with seller wallet balances.
//   - SELL / SELL_BITCOIN / BUY_GIFT_CARD → creator must hold >= $10 of the offer's asset
//     (BTC for BUY_GIFT_CARD and BTC-asset offers, USDT for USDT-asset offers)
//   - Runs at startup and every 10 minutes via the interval in server.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const BTC_REQUIRED_TYPES = ['SELL', 'SELL_BITCOIN', 'BUY_GIFT_CARD'];
const MIN_USD = 10;
const BTC_PRICE_APPROX = 88000; // used only when listing has no bitcoin_price set

// Gift-card vendors don't need wallet funds to fulfil a sale — they hand over a card,
// the buyer sends the crypto, not the other way round. But a vendor who has drained
// their own wallet down near zero right after locking the mandatory $200 seller
// deposit is a classic exit-scam setup: get verified, cash everything out, then have
// nothing left to lose beyond the deposit on a single much bigger scam. This mirrors
// SELLER_DEPOSIT_AMOUNT in server.js — if what's left in their spendable wallet drops
// below what they already put up as collateral, pause their listings so buyers can't
// open new trades with them until they top back up. Deliberately pause-only: never
// auto-reactivate here, since that could silently undo a deposit seizure/rejection or
// a deliberate admin pause — reactivating is a manual/CEO call.
const GIFT_CARD_SAFETY_MIN_USD = 200;

// The in-memory market cache lives in server.js — wired up once at startup via
// setCacheBuster() so every call site here (deposits, trades, the 10-min sweep)
// invalidates it without each caller needing to know about it.
let _bustCache = () => {};
function setCacheBuster(fn) { _bustCache = fn; }

// Live BTC price also lives in server.js — wired up the same way. Balance-sufficiency
// checks must use the real market price, never a listing's own bitcoin_price field: that
// field can be stale or unrelated to real value (e.g. on 'market' pricing_type listings,
// where it isn't used for rate display at all), and trusting it let near-empty wallets
// pass the $10 minimum simply because their listing quoted an inflated price.
let _getLiveBtcPrice = () => BTC_PRICE_APPROX;
function setBtcPriceGetter(fn) { _getLiveBtcPrice = fn; }

async function _notifyLowBalancePause(userId, count) {
  try {
    await supabaseAdmin.from('notifications').insert([{
      user_id:    userId,
      type:       'offer_paused_low_balance',
      title:      `⏸ Your offer${count > 1 ? 's have' : ' has'} been paused`,
      message:    `Your ${count > 1 ? count + ' offers were' : 'offer was'} automatically paused because your wallet balance dropped below $10. Load your wallet to reactivate ${count > 1 ? 'them' : 'it'}.`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    }]);
  } catch (err) {
    console.error('[_notifyLowBalancePause]', err.message);
  }
}

async function _notifyGiftCardSafetyPause(userId, count) {
  try {
    await supabaseAdmin.from('notifications').insert([{
      user_id:    userId,
      type:       'offer_paused_low_balance',
      title:      `⏸ Your gift-card listing${count > 1 ? 's have' : ' has'} been paused`,
      message:    `Your ${count > 1 ? count + ' gift-card listings were' : 'gift-card listing was'} paused because your wallet balance dropped below your $${GIFT_CARD_SAFETY_MIN_USD} security deposit. Top up your wallet and contact support to reactivate.`,
      action:     '/wallet',
      is_read:    false,
      created_at: new Date().toISOString(),
    }]);
  } catch (err) {
    console.error('[_notifyGiftCardSafetyPause]', err.message);
  }
}

/** Called by depositMonitor / tradeEscrowService after a balance change for one user. */
async function updateOfferStatus(userId) {
  try {
    const { data: wallet } = await supabaseAdmin
      .from('wallets').select('balance_btc, balance_usdt').eq('user_id', userId).maybeSingle();
    const btcBalUsd  = parseFloat(wallet?.balance_btc || 0) * _getLiveBtcPrice();
    const usdtBalUsd = parseFloat(wallet?.balance_usdt || 0); // 1 USDT ≈ $1

    const { data: offers } = await supabaseAdmin
      .from('listings')
      .select('id, status, listing_type, asset')
      .eq('seller_id', userId)
      .in('listing_type', BTC_REQUIRED_TYPES)
      .in('status', ['ACTIVE', 'PAUSED']);

    if (!offers || offers.length === 0) return { paused: 0, reactivated: 0 };

    const balUsdFor = (o) => o.asset === 'USDT' ? usdtBalUsd : btcBalUsd;
    const toPause      = offers.filter(o => o.status === 'ACTIVE'  && balUsdFor(o) < MIN_USD).map(o => o.id);
    const toReactivate = offers.filter(o => o.status === 'PAUSED'  && balUsdFor(o) >= MIN_USD).map(o => o.id);

    if (toPause.length > 0) {
      await supabaseAdmin.from('listings')
        .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
        .in('id', toPause);
      console.log(`[offerStatus] Paused ${toPause.length} offer(s) for user ${userId} (balance $${btcBalUsd.toFixed(2)})`);
      await _notifyLowBalancePause(userId, toPause.length);
    }
    if (toReactivate.length > 0) {
      await supabaseAdmin.from('listings')
        .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
        .in('id', toReactivate);
      console.log(`[offerStatus] Reactivated ${toReactivate.length} offer(s) for user ${userId} (balance $${btcBalUsd.toFixed(2)})`);
    }
    // Gift-card vendor safety check — see GIFT_CARD_SAFETY_MIN_USD above.
    let gcPaused = 0;
    const combinedUsd = btcBalUsd + usdtBalUsd;
    if (combinedUsd < GIFT_CARD_SAFETY_MIN_USD) {
      const { data: gcOffers } = await supabaseAdmin
        .from('listings').select('id')
        .eq('seller_id', userId).eq('listing_type', 'SELL_GIFT_CARD').eq('status', 'ACTIVE');
      if (gcOffers && gcOffers.length > 0) {
        await supabaseAdmin.from('listings')
          .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
          .in('id', gcOffers.map(o => o.id));
        gcPaused = gcOffers.length;
        console.log(`[offerStatus] Paused ${gcPaused} SELL_GIFT_CARD listing(s) for ${userId} — wallet down to $${combinedUsd.toFixed(2)}, below the $${GIFT_CARD_SAFETY_MIN_USD} deposit`);
        await _notifyGiftCardSafetyPause(userId, gcPaused);
      }
    }

    if (toPause.length > 0 || toReactivate.length > 0 || gcPaused > 0) _bustCache();

    return { paused: toPause.length + gcPaused, reactivated: toReactivate.length };
  } catch (err) {
    console.error('[updateOfferStatus]', err.message);
    return { paused: 0, reactivated: 0 };
  }
}

/**
 * Full sweep — checks every ACTIVE/PAUSED BTC-required listing against live balances.
 * Runs at startup and every 10 minutes.
 */
async function syncAllOfferStatuses() {
  try {
    // Fetch all ACTIVE and PAUSED BTC/USDT-required listings
    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      .select('id, seller_id, status, listing_type, asset, bitcoin_price, min_limit_usd')
      .in('listing_type', BTC_REQUIRED_TYPES)
      .in('status', ['ACTIVE', 'PAUSED']);

    if (error) { console.error('[syncAllOfferStatuses] DB error:', error.message); return; }
    if (!listings || listings.length === 0) {
      console.log('[syncAllOfferStatuses] No BTC-required listings found.');
      return;
    }

    // Fetch wallet balances for all unique sellers
    const sellerIds = [...new Set(listings.map(l => l.seller_id))];
    const { data: wallets } = await supabaseAdmin
      .from('wallets').select('user_id, balance_btc, balance_usdt').in('user_id', sellerIds);

    const balMap = {};
    const usdtBalMap = {};
    (wallets || []).forEach(w => {
      balMap[w.user_id] = parseFloat(w.balance_btc || 0);
      usdtBalMap[w.user_id] = parseFloat(w.balance_usdt || 0);
    });

    const toPause      = [];
    const toReactivate = [];

    const livePrice = _getLiveBtcPrice();
    for (const listing of listings) {
      const isUsdt    = listing.asset === 'USDT';
      const balUsd     = isUsdt
        ? (usdtBalMap[listing.seller_id] || 0)
        : (balMap[listing.seller_id] || 0) * livePrice;
      const minUsd    = parseFloat(listing.min_limit_usd || 0);

      // Pause if balance < $10 or can't meet the offer's own minimum
      const cantFulfil = balUsd < MIN_USD || (minUsd > 0 && balUsd < minUsd);
      if (listing.status === 'ACTIVE'  && cantFulfil)  toPause.push(listing.id);
      if (listing.status === 'PAUSED'  && !cantFulfil) toReactivate.push(listing.id);

      // NOTE: we intentionally do NOT permanently cap max_limit_usd/max_limit_local to the
      // live balance here. That used to clamp max down (with a $10 floor) but never restore
      // it once balance recovered, and never checked the result against min_limit_usd — so a
      // listing whose balance dipped once would be stuck forever with max_limit stuck below
      // min_limit (an impossible, inverted range). The /api/listings and /api/listings/:id
      // endpoints already cap the *effective* tradeable max to live balance at read time
      // without mutating the stored listing, which is enough to prevent overselling.
    }

    if (toPause.length > 0) {
      await supabaseAdmin.from('listings')
        .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
        .in('id', toPause);
      console.log(`[syncAllOfferStatuses] ⏸  Paused ${toPause.length} offer(s) with insufficient balance.`);

      // One notification per affected seller, not per offer.
      const pausedSet = new Set(toPause);
      const countBySeller = {};
      for (const l of listings) {
        if (pausedSet.has(l.id)) countBySeller[l.seller_id] = (countBySeller[l.seller_id] || 0) + 1;
      }
      await Promise.all(
        Object.entries(countBySeller).map(([sellerId, count]) => _notifyLowBalancePause(sellerId, count))
      );
    }
    if (toReactivate.length > 0) {
      await supabaseAdmin.from('listings')
        .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
        .in('id', toReactivate);
      console.log(`[syncAllOfferStatuses] ✅ Reactivated ${toReactivate.length} offer(s) with sufficient balance.`);
    }

    // Gift-card vendor safety sweep — see GIFT_CARD_SAFETY_MIN_USD. Catches anyone whose
    // wallet drained below the deposit amount through a path that didn't already trigger
    // updateOfferStatus(userId) directly (e.g. a CEO-approved withdrawal broadcast).
    const gcPausedCount = await sweepGiftCardVendorSafety();

    if (toPause.length === 0 && toReactivate.length === 0 && gcPausedCount === 0) {
      console.log('[syncAllOfferStatuses] ✅ All offer statuses are already correct.');
    } else {
      _bustCache();
    }
  } catch (err) {
    console.error('[syncAllOfferStatuses]', err.message);
  }
}

// Shared by the per-user hook and the full sweep: pause any ACTIVE SELL_GIFT_CARD listing
// whose seller's combined wallet balance has dropped below GIFT_CARD_SAFETY_MIN_USD.
// Pause-only by design — see the comment on GIFT_CARD_SAFETY_MIN_USD above.
async function sweepGiftCardVendorSafety() {
  const { data: gcListings } = await supabaseAdmin
    .from('listings').select('id, seller_id')
    .eq('listing_type', 'SELL_GIFT_CARD').eq('status', 'ACTIVE');
  if (!gcListings || gcListings.length === 0) return 0;

  const sellerIds = [...new Set(gcListings.map(l => l.seller_id))];
  const { data: wallets } = await supabaseAdmin
    .from('wallets').select('user_id, balance_btc, balance_usdt').in('user_id', sellerIds);
  const livePrice = _getLiveBtcPrice();
  const balUsdMap = {};
  (wallets || []).forEach(w => {
    balUsdMap[w.user_id] = parseFloat(w.balance_btc || 0) * livePrice + parseFloat(w.balance_usdt || 0);
  });

  const toPauseIds = gcListings.filter(l => (balUsdMap[l.seller_id] || 0) < GIFT_CARD_SAFETY_MIN_USD).map(l => l.id);
  if (toPauseIds.length === 0) return 0;

  await supabaseAdmin.from('listings')
    .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
    .in('id', toPauseIds);
  console.log(`[offerStatus] ⏸  Paused ${toPauseIds.length} SELL_GIFT_CARD listing(s) — seller wallet below the $${GIFT_CARD_SAFETY_MIN_USD} deposit amount.`);

  const pausedSet = new Set(toPauseIds);
  const countBySeller = {};
  for (const l of gcListings) if (pausedSet.has(l.id)) countBySeller[l.seller_id] = (countBySeller[l.seller_id] || 0) + 1;
  await Promise.all(Object.entries(countBySeller).map(([sellerId, count]) => _notifyGiftCardSafetyPause(sellerId, count)));

  return toPauseIds.length;
}

/**
 * Deactivates offers from sellers who haven't been active for 10+ days.
 * Runs at startup and every 6 hours. Sends one in-app notification per seller.
 */
async function deactivateStaleOffers() {
  try {
    const TEN_DAYS_AGO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // All currently ACTIVE listings
    const { data: activeListings, error: listErr } = await supabaseAdmin
      .from('listings')
      .select('id, seller_id, payment_method, currency')
      .eq('status', 'ACTIVE');

    if (listErr) { console.error('[deactivateStaleOffers] listings query:', listErr.message); return; }
    if (!activeListings?.length) return;

    const sellerIds = [...new Set(activeListings.map(l => l.seller_id))];

    // Fetch last activity for all sellers
    const { data: sellers, error: usersErr } = await supabaseAdmin
      .from('users')
      .select('id, username, last_seen_at, last_login')
      .in('id', sellerIds);

    if (usersErr || !sellers?.length) return;

    // Sellers where BOTH last_seen_at and last_login are older than 10 days (or null)
    const staleSellers = new Set(
      sellers
        .filter(s => {
          const lastActive = s.last_seen_at || s.last_login;
          return !lastActive || new Date(lastActive) < new Date(TEN_DAYS_AGO);
        })
        .map(s => s.id)
    );

    if (staleSellers.size === 0) {
      console.log('[deactivateStaleOffers] ✅ No stale sellers — all sellers active within 10 days.');
      return;
    }

    const staleListings = activeListings.filter(l => staleSellers.has(l.seller_id));
    if (!staleListings.length) return;

    // Pause all stale listings
    const staleIds = staleListings.map(l => l.id);
    await supabaseAdmin
      .from('listings')
      .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
      .in('id', staleIds);

    console.log(`[deactivateStaleOffers] ⏸  Paused ${staleIds.length} offer(s) for ${staleSellers.size} inactive seller(s).`);

    // One notification per seller (not per offer)
    const seen = new Set();
    const notifications = [];
    for (const l of staleListings) {
      if (seen.has(l.seller_id)) continue;
      seen.add(l.seller_id);
      const count = staleListings.filter(x => x.seller_id === l.seller_id).length;
      const plural = count > 1;
      notifications.push({
        user_id:    l.seller_id,
        type:       'offer_paused',
        title:      `⏸ Your offer${plural ? 's have' : ' has'} been paused`,
        message:    `Your ${plural ? count + ' offers were' : 'offer was'} automatically paused — you haven't been active on PRAQEN for over 10 days. Visit My Offers to reactivate and start receiving trade requests again.`,
        action:     '/my-listings',
        is_read:    false,
        created_at: new Date().toISOString(),
      });
    }

    if (notifications.length > 0) {
      await supabaseAdmin.from('notifications').insert(notifications);
      console.log(`[deactivateStaleOffers] 🔔 Sent ${notifications.length} reactivation notification(s).`);
    }
  } catch (err) {
    console.error('[deactivateStaleOffers]', err.message);
  }
}

module.exports = { updateOfferStatus, syncAllOfferStatuses, deactivateStaleOffers, setCacheBuster, setBtcPriceGetter };
