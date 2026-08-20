// services/traderOfWeekService.js
// "Active Trader of the Week" — auto-picks the best-performing trader for each
// market category and rotates the pick weekly, replacing what used to be a
// hardcoded username in the frontend (rafi_crypto / iraqiy_xchange /
// kingkong79-pro) that only ever changed via a code deploy.
//
// Winner = highest total_trades, tie-broken by average_rating then
// positive_feedback, among sellers who currently have a real ACTIVE listing
// in that category and have been seen on the platform in the last 7 days
// (never feature someone who's gone quiet). Picked once per rotation window
// and persisted in trader_of_week — NOT recomputed on every page load, so the
// badge stays stable for the whole week instead of flickering to whoever is
// momentarily ahead.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const ROTATION_DAYS = parseInt(process.env.TRADER_OF_WEEK_ROTATION_DAYS || '7', 10);
const ACTIVE_WITHIN_DAYS = 7; // must have been seen in the last week to qualify

const CATEGORIES = {
  buy_bitcoin:  { listingTypes: ['SELL', 'SELL_BITCOIN'], asset: 'BTC' }, // Buy Bitcoin page trades against sellers
  sell_bitcoin: { listingTypes: ['BUY', 'BUY_BITCOIN'],   asset: 'BTC' }, // Sell Bitcoin page trades against buyers
  gift_card:    { listingTypes: ['BUY_GIFT_CARD', 'SELL_GIFT_CARD'], asset: null },
};

async function computeCategoryWinner(category) {
  const { listingTypes, asset } = CATEGORIES[category];
  let q = supabaseAdmin
    .from('listings')
    .select('id, seller_id, listing_type, created_at')
    .in('listing_type', listingTypes)
    .eq('status', 'ACTIVE');
  if (asset) q = q.eq('asset', asset);
  const { data: listings, error } = await q;
  if (error || !listings || listings.length === 0) return null;

  const sellerIds = [...new Set(listings.map(l => l.seller_id).filter(Boolean))];
  if (sellerIds.length === 0) return null;

  const { data: sellers } = await supabaseAdmin
    .from('users')
    .select('id, username, total_trades, average_rating, positive_feedback, last_seen_at, last_login, account_status')
    .in('id', sellerIds);
  if (!sellers || sellers.length === 0) return null;

  const activeCutoff = Date.now() - ACTIVE_WITHIN_DAYS * 24 * 60 * 60 * 1000;
  const eligible = sellers.filter(u => {
    if (u.account_status === 'banned') return false;
    const lastSeen = u.last_seen_at || u.last_login;
    return lastSeen && new Date(lastSeen).getTime() >= activeCutoff;
  });
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const trades = (b.total_trades || 0) - (a.total_trades || 0);
    if (trades !== 0) return trades;
    const rating = parseFloat(b.average_rating || 0) - parseFloat(a.average_rating || 0);
    if (rating !== 0) return rating;
    return (b.positive_feedback || 0) - (a.positive_feedback || 0);
  });

  const winner = eligible[0];
  // Feature that winner's most recently created ACTIVE listing in this category.
  const winnerListings = listings.filter(l => l.seller_id === winner.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const listingId = winnerListings[0]?.id || null;
  if (!listingId) return null;

  return {
    user_id: winner.id,
    username: winner.username,
    listing_id: listingId,
    total_trades: winner.total_trades || 0,
    average_rating: parseFloat(winner.average_rating || 0),
  };
}

/** Runs at startup and periodically — only recomputes a category once its rotation window has passed. */
async function syncTraderOfWeek() {
  try {
    const { data: existingRows } = await supabaseAdmin.from('trader_of_week').select('category, next_rotation_at');
    const existingMap = Object.fromEntries((existingRows || []).map(r => [r.category, r]));
    const now = Date.now();

    for (const category of Object.keys(CATEGORIES)) {
      const existing = existingMap[category];
      const due = !existing || new Date(existing.next_rotation_at).getTime() <= now;
      if (!due) continue;

      const winner = await computeCategoryWinner(category);
      if (!winner) {
        console.log(`[traderOfWeek] No eligible winner for "${category}" — leaving previous pick in place.`);
        continue;
      }

      const nowIso = new Date().toISOString();
      const nextRotation = new Date(now + ROTATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from('trader_of_week').upsert({
        category,
        ...winner,
        selected_at: nowIso,
        next_rotation_at: nextRotation,
      }, { onConflict: 'category' });

      console.log(`[traderOfWeek] ${category} → @${winner.username} (${winner.total_trades} trades) — next rotation ${nextRotation}`);
    }
  } catch (err) {
    console.error('[traderOfWeek] syncTraderOfWeek error:', err.message);
  }
}

async function getAllWinners() {
  const { data, error } = await supabaseAdmin.from('trader_of_week').select('*');
  if (error) return {};
  return Object.fromEntries((data || []).map(r => [r.category, r]));
}

module.exports = { syncTraderOfWeek, getAllWinners, computeCategoryWinner, CATEGORIES };
