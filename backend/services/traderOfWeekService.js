// services/traderOfWeekService.js
// Special-offer flow: two auto-picked badges per country — one on the Buy Bitcoin
// page ("Active Trader of the Week" — the most active seller in that country) and
// one on the Sell Bitcoin page ("High Volume Trader of the Week" — the most active
// buyer in that country who pays through that country's own local payment method,
// e.g. MTN Mobile Money in Ghana). Plus the existing single global Gift Card badge.
//
// Hard rule: no user can hold more than one special-offer badge at the same time.
// All slots (every country's buy + sell badge, plus gift_card) are recomputed
// together in one pass so a "usedUserIds" set can enforce that — computing slots
// independently on staggered schedules could let the same trader win a second
// badge in another slot before their first one expires.
//
// Winner = highest total_trades, tie-broken by average_rating then
// positive_feedback, among traders who currently have a real ACTIVE listing in
// that slot and have been seen on the platform in the last 7 days. Picked once
// per rotation window (7 days by default) and persisted in trader_of_week so the
// badges stay stable all week instead of flickering to whoever is momentarily ahead.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const ROTATION_DAYS = parseInt(process.env.TRADER_OF_WEEK_ROTATION_DAYS || '7', 10);
const ACTIVE_WITHIN_DAYS = 7; // must have been seen in the last week to qualify

/** Real completed-trade volume for a winner, summed over the trailing rotation
 *  window. volume_days reflects how many days that volume actually spans (their
 *  first completed trade in the window to now) instead of always claiming the
 *  full window, so a trader who only started trading 2 days ago shows "2 days"
 *  rather than an inflated "7 days". */
async function fetchWinnerVolume(userId) {
  const windowStart = new Date(Date.now() - ROTATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('trades')
    .select('amount_usd, completed_at')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .eq('status', 'COMPLETED')
    .gte('completed_at', windowStart);
  if (error || !data || data.length === 0) return { volume_usd: 0, volume_days: 0 };

  const volumeUsd = data.reduce((sum, t) => sum + parseFloat(t.amount_usd || 0), 0);
  const earliest = data.reduce((min, t) => {
    const ts = new Date(t.completed_at).getTime();
    return ts < min ? ts : min;
  }, Date.now());
  const spanDays = Math.max(1, Math.min(ROTATION_DAYS, Math.ceil((Date.now() - earliest) / (24 * 60 * 60 * 1000))));
  return { volume_usd: volumeUsd, volume_days: spanDays };
}

// Sell-page badge must reward traders paying through the market's own local rail.
// Ghana is pinned to MTN Mobile Money per product decision; every other country
// auto-detects its own most-used payment method from active BUY listings so this
// stays a real "auto flow" instead of needing a manual entry added per market.
const COUNTRY_LOCAL_PAYMENT = { GH: 'mtn' };

function dominantPaymentMethod(listings) {
  const counts = {};
  for (const l of listings) {
    const pm = String(l.payment_method || '').toLowerCase().trim();
    if (!pm) continue;
    counts[pm] = (counts[pm] || 0) + 1;
  }
  let best = null, bestCount = 0;
  for (const [pm, count] of Object.entries(counts)) {
    if (count > bestCount) { best = pm; bestCount = count; }
  }
  return best;
}

async function fetchActiveBtcListings() {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select('id, seller_id, listing_type, country, payment_method, created_at')
    .in('listing_type', ['SELL', 'SELL_BITCOIN', 'BUY', 'BUY_BITCOIN'])
    .eq('status', 'ACTIVE')
    .eq('asset', 'BTC');
  if (error) throw error;
  return data || [];
}

async function fetchActiveGiftCardListings() {
  const { data, error } = await supabaseAdmin
    .from('listings')
    .select('id, seller_id, listing_type, created_at')
    .in('listing_type', ['BUY_GIFT_CARD', 'SELL_GIFT_CARD'])
    .eq('status', 'ACTIVE');
  if (error) throw error;
  return data || [];
}

/** Computes every (page, country) winner + the gift_card winner in one pass, enforcing
 *  that no user_id is picked for more than one slot. Skips any category that's
 *  currently pinned (a manual admin override) and keeps that user reserved so
 *  they can't also win a different slot. Returns {category: winner}. */
async function computeAllWinners() {
  const [btcListings, giftListings, { data: pinnedRows }] = await Promise.all([
    fetchActiveBtcListings(),
    fetchActiveGiftCardListings(),
    supabaseAdmin.from('trader_of_week').select('category, user_id').eq('pinned', true),
  ]);

  const pinnedCategories = new Set((pinnedRows || []).map(r => r.category));
  const usedUserIds = new Set((pinnedRows || []).map(r => r.user_id).filter(Boolean));

  const sellerIds = [...new Set([...btcListings, ...giftListings].map(l => l.seller_id).filter(Boolean))];
  if (sellerIds.length === 0) return {};

  const { data: sellers } = await supabaseAdmin
    .from('users')
    .select('id, username, total_trades, average_rating, positive_feedback, last_seen_at, last_login, account_status')
    .in('id', sellerIds);
  const sellerMap = Object.fromEntries((sellers || []).map(u => [u.id, u]));

  const activeCutoff = Date.now() - ACTIVE_WITHIN_DAYS * 24 * 60 * 60 * 1000;
  const isEligible = (u) => !!u && u.account_status !== 'banned'
    && !!(u.last_seen_at || u.last_login)
    && new Date(u.last_seen_at || u.last_login).getTime() >= activeCutoff;

  // Ranks the sellers behind a set of listings and hands the slot to the best
  // eligible one not already holding another badge; marks them used on success.
  const pickWinner = async (candidateListings, extraFields = {}) => {
    const candidateSellerIds = [...new Set(candidateListings.map(l => l.seller_id).filter(Boolean))];
    const ranked = candidateSellerIds
      .map(id => sellerMap[id])
      .filter(u => isEligible(u) && !usedUserIds.has(u.id))
      .sort((a, b) => {
        const trades = (b.total_trades || 0) - (a.total_trades || 0);
        if (trades !== 0) return trades;
        const rating = parseFloat(b.average_rating || 0) - parseFloat(a.average_rating || 0);
        if (rating !== 0) return rating;
        return (b.positive_feedback || 0) - (a.positive_feedback || 0);
      });
    const winner = ranked[0];
    if (!winner) return null;
    const listing = candidateListings
      .filter(l => l.seller_id === winner.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    if (!listing) return null;
    usedUserIds.add(winner.id);
    const { volume_usd, volume_days } = await fetchWinnerVolume(winner.id);
    return {
      user_id: winner.id,
      username: winner.username,
      listing_id: listing.id,
      total_trades: winner.total_trades || 0,
      average_rating: parseFloat(winner.average_rating || 0),
      volume_usd,
      volume_days,
      ...extraFields,
    };
  };

  const results = {};
  const countries = [...new Set(btcListings.map(l => (l.country || '').toUpperCase()).filter(Boolean))];

  for (const country of countries) {
    // Buy-page badge: Active Trader of the Week — most active seller in this country.
    if (!pinnedCategories.has(`buy_bitcoin:${country}`)) {
      const sellListings = btcListings.filter(l =>
        (l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN') &&
        (l.country || '').toUpperCase() === country);
      const buyPageWinner = await pickWinner(sellListings, { country });
      if (buyPageWinner) results[`buy_bitcoin:${country}`] = buyPageWinner;
    }

    // Sell-page badge: High Volume Trader of the Week — most active buyer in this
    // country who pays through the country's own local payment method.
    if (!pinnedCategories.has(`sell_bitcoin:${country}`)) {
      const buyListingsAll = btcListings.filter(l =>
        (l.listing_type === 'BUY' || l.listing_type === 'BUY_BITCOIN') &&
        (l.country || '').toUpperCase() === country);
      const localMethod = COUNTRY_LOCAL_PAYMENT[country] || dominantPaymentMethod(buyListingsAll);
      const localBuyListings = localMethod
        ? buyListingsAll.filter(l => String(l.payment_method || '').toLowerCase().includes(localMethod))
        : buyListingsAll;
      const sellPageWinner = await pickWinner(localBuyListings.length ? localBuyListings : buyListingsAll, {
        country, payment_method: localMethod || null,
      });
      if (sellPageWinner) results[`sell_bitcoin:${country}`] = sellPageWinner;
    }
  }

  if (!pinnedCategories.has('gift_card')) {
    const giftCardWinner = await pickWinner(giftListings);
    if (giftCardWinner) results.gift_card = giftCardWinner;
  }

  return results;
}

/** Runs at startup and periodically — only recomputes once the shared rotation window has passed. */
async function syncTraderOfWeek() {
  try {
    const { data: latest } = await supabaseAdmin
      .from('trader_of_week')
      .select('next_rotation_at')
      .order('selected_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const now = Date.now();
    const due = !latest || new Date(latest.next_rotation_at).getTime() <= now;
    if (!due) return;

    const winners = await computeAllWinners();
    const nowIso = new Date().toISOString();
    const nextRotation = new Date(now + ROTATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const rows = Object.entries(winners).map(([category, w]) => ({
      category, ...w, selected_at: nowIso, next_rotation_at: nextRotation,
    }));

    // Full replace each rotation — slots are dynamic per-country now, so a country
    // that no longer has active listings must not keep a stale badge forever.
    // Pinned rows (manual admin override) are left untouched — computeAllWinners()
    // already excluded their categories, so nothing here would overwrite them anyway.
    await supabaseAdmin.from('trader_of_week').delete().neq('category', '__never_matches__').eq('pinned', false);
    if (rows.length) await supabaseAdmin.from('trader_of_week').upsert(rows, { onConflict: 'category' });

    console.log(`[traderOfWeek] rotated ${rows.length} special-offer slot(s) — next rotation ${nextRotation}`);
  } catch (err) {
    console.error('[traderOfWeek] syncTraderOfWeek error:', err.message);
  }
}

async function getAllWinners() {
  const { data, error } = await supabaseAdmin.from('trader_of_week').select('*');
  if (error) return {};
  return Object.fromEntries((data || []).map(r => [r.category, r]));
}

module.exports = { syncTraderOfWeek, getAllWinners, computeAllWinners };
