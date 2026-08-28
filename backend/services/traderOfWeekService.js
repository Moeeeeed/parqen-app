// services/traderOfWeekService.js
// PRAQEN Traders of the Week — 5 fixed recognition slots:
//   sell_bitcoin_gh — strongest active Ghana Sell-Bitcoin-page buyer (mtn momo)
//   buy_bitcoin_ng  — strongest active Nigeria Buy-Bitcoin-page seller
//   gift_card       — strongest active Gift Card trader
//   sell_bitcoin_ke — strongest active Kenya Sell-Bitcoin-page buyer (m-pesa)
//   rising_trader   — promising newer trader, separate lighter-weight bar
//
// This module only RANKS candidates — it never writes a winner on its own.
// The CEO/admin picks the winner via POST /api/admin/trader-of-week/select
// (server.js), which is the only thing that ever writes to trader_of_week.
// That's a deliberate change from the old version of this file, which
// silently auto-rotated winners every 7 days; see database/
// trader_of_week_redesign.sql for the schema this now assumes.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SLOTS = ['sell_bitcoin_gh', 'buy_bitcoin_ng', 'gift_card', 'sell_bitcoin_ke', 'rising_trader'];

// ── Eligibility thresholds — data-grounded against real PRAQEN activity
// (queried 2026-08-25: of 88 users with an active listing + recent activity,
// 46 had zero completed trades; requiring >=5 trades still leaves 33 eligible
// candidates, comfortably competitive for 5 slots).
const ESTABLISHED_MIN_TRADES     = 5;
const ESTABLISHED_MIN_COMPLETION = 70;   // percent
const RISING_MAX_TRADES          = 5;    // exclusive — must be fewer than this
const RISING_MIN_COMPLETION      = 80;   // percent — stricter than established, since volume can't carry them
const RISING_MIN_RATING          = 4.5;  // only enforced if they have a rating at all
const ACTIVE_WITHIN_DAYS         = 7;    // "active within the last 7 days" gate
const RECENT_TRADE_WINDOW_DAYS   = 7;    // "this week" activity component of the score
const RISING_RECENT_WINDOW_DAYS  = 14;   // rising trader needs a recent completed trade within this window

// Gift Card completion rates run structurally lower than BTC (data check
// 2026-08-25: gift-card-specific completion median 28%, average 37%, across
// the 9 active gift-card sellers with any trade history at all — nobody
// clears the 70% BTC bar, including the trader already pinned in this slot).
// So this slot uses its own, gift-card-specific completion figure (computed
// fresh from trades with a gift_card_brand set) instead of the platform-wide
// users.completion_rate the other 4 slots use.
const GIFTCARD_MIN_TRADES     = 5;
const GIFTCARD_MIN_COMPLETION = 20; // percent, gift-card-specific

// ── Auto-rotation (unpinned slots only) ─────────────────────────────────────
// A slot rotates to the next eligible, currently-online candidate every
// ROTATION_HOURS — but only if nobody has hard-pinned it (pinned=true, set by
// a manual admin pick via selectWinner/the select endpoint, or the
// pin_trader_of_week() SQL helper). See runAutoRotation() below.
const ROTATION_HOURS        = 24; // rotate unpinned slots once a day (was 48)
const ONLINE_WITHIN_MINUTES = 5; // "online right now" gate, matches the online-badge threshold used elsewhere on the marketplace pages

const COUNTRY_LOCAL_PAYMENT = { GH: 'mtn', KE: 'mpesa' }; // Ghana=MTN Mobile Money, Kenya=M-Pesa, per product decision

// ── Data fetchers ────────────────────────────────────────────────────────────
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
    .select('id, seller_id, listing_type, country, created_at')
    .in('listing_type', ['BUY_GIFT_CARD', 'SELL_GIFT_CARD'])
    .eq('status', 'ACTIVE');
  if (error) throw error;
  return data || [];
}

async function fetchUsersByIds(ids) {
  if (!ids.length) return {};
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, username, country, total_trades, completion_rate, average_rating, positive_feedback, negative_feedback, total_feedback_count, last_seen_at, last_login, account_status, has_warning')
    .in('id', ids);
  if (error) throw error;
  return Object.fromEntries((data || []).map(u => [u.id, u]));
}

// Recent completed-trade count + median trade_duration_seconds per user, over
// the trailing `windowDays`. Two queries (buyer side, seller side) because a
// single .or() with two .in() arrays isn't reliably expressible via the JS
// client — merged and deduped by trade id below.
async function fetchRecentTradeStats(userIds, windowDays) {
  const stats = {};
  for (const id of userIds) stats[id] = { recentCount: 0, durations: [] };
  if (!userIds.length) return stats;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: asBuyer }, { data: asSeller }] = await Promise.all([
    supabaseAdmin.from('trades').select('id, buyer_id, seller_id, completed_at, trade_duration_seconds')
      .in('buyer_id', userIds).eq('status', 'COMPLETED').gte('completed_at', since),
    supabaseAdmin.from('trades').select('id, buyer_id, seller_id, completed_at, trade_duration_seconds')
      .in('seller_id', userIds).eq('status', 'COMPLETED').gte('completed_at', since),
  ]);

  const seen = new Set();
  for (const t of [...(asBuyer || []), ...(asSeller || [])]) {
    for (const uid of [t.buyer_id, t.seller_id]) {
      if (!stats[uid]) continue;
      const key = `${t.id}:${uid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stats[uid].recentCount++;
      if (t.trade_duration_seconds) stats[uid].durations.push(t.trade_duration_seconds);
    }
  }
  return stats;
}

// All-time gift-card-specific trade count + completion rate per user (trades
// with a gift_card_brand set), independent of their platform-wide completion_rate.
// See GIFTCARD_MIN_COMPLETION comment above for why this slot needs its own figure.
async function fetchGiftCardStats(userIds) {
  const stats = {};
  for (const id of userIds) stats[id] = { total: 0, completed: 0, completionRate: null };
  if (!userIds.length) return stats;

  const [{ data: asBuyer }, { data: asSeller }] = await Promise.all([
    supabaseAdmin.from('trades').select('id, buyer_id, seller_id, status').in('buyer_id', userIds).not('gift_card_brand', 'is', null),
    supabaseAdmin.from('trades').select('id, buyer_id, seller_id, status').in('seller_id', userIds).not('gift_card_brand', 'is', null),
  ]);

  const seen = new Set();
  for (const t of [...(asBuyer || []), ...(asSeller || [])]) {
    for (const uid of [t.buyer_id, t.seller_id]) {
      if (!stats[uid]) continue;
      const key = `${t.id}:${uid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stats[uid].total++;
      if (t.status === 'COMPLETED') stats[uid].completed++;
    }
  }
  for (const id of userIds) {
    const s = stats[id];
    s.completionRate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : null;
  }
  return stats;
}

// ── Scoring ──────────────────────────────────────────────────────────────────
// Wilson lower-bound confidence interval on positive-feedback ratio — protects
// against a single 5-star review outranking someone with 40 reviews at 95%
// positive. Returns 0 for a user with no feedback yet.
function wilsonLowerBound(positive, total) {
  if (!total || total <= 0) return 0;
  const z = 1.96; // 95% confidence
  const p = Math.min(1, Math.max(0, positive / total)); // clamp — guards against any future inconsistent counter data
  const denom = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denom);
}

// Median trade_duration_seconds -> 0..1, faster = higher. <=30min = 1.0 (max
// speed credit), >=24h = 0. No data at all -> neutral 0.5 (doesn't punish or
// reward traders who just don't have duration data yet).
function speedScore(durations) {
  if (!durations || durations.length === 0) return 0.5;
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const FAST = 30 * 60, SLOW = 24 * 60 * 60;
  if (median <= FAST) return 1;
  if (median >= SLOW) return 0;
  return 1 - (median - FAST) / (SLOW - FAST);
}

// completionOverride / tradesOverride let the Gift Card slot score on its own
// gift-card-specific completion rate + trade count instead of the user's
// platform-wide figures (see GIFTCARD_MIN_COMPLETION comment above).
function computeScore(user, tradeStats, { completionOverride, tradesOverride } = {}) {
  const recentActivityScore = Math.min(1, (tradeStats.recentCount || 0) / 10);
  const ratingScore = Math.min(1, parseFloat(user.average_rating || 0) / 5);
  const completionRate = completionOverride ?? (user.completion_rate ?? 0);
  const completionScore = Math.min(1, completionRate / 100);
  // total_feedback_count has been observed inconsistent with positive_feedback +
  // negative_feedback on some accounts (e.g. positive_feedback far exceeding
  // total_feedback_count) — always deriving the denominator from the two
  // granular counters avoids feeding Wilson a probability > 1 (which produces NaN).
  const feedbackScore = wilsonLowerBound(user.positive_feedback || 0, (user.positive_feedback || 0) + (user.negative_feedback || 0));
  const totalTrades = tradesOverride ?? (user.total_trades || 0);
  const experienceScore = Math.min(1, Math.log10(totalTrades + 1) / Math.log10(101));
  const speed = speedScore(tradeStats.durations);

  const score = 30 * recentActivityScore + 15 * ratingScore + 20 * completionScore
              + 15 * feedbackScore + 10 * experienceScore + 10 * speed;

  return { score: Math.round(score * 100) / 100, breakdown: { recentActivityScore, ratingScore, completionScore, feedbackScore, experienceScore, speed } };
}

// Short, data-driven explanation of why the system surfaced this candidate —
// shown to the admin alongside the raw stats, and stored as `reason` at
// selection time. Never exposes the internal score formula itself.
function buildReason(user, tradeStats, completionRate) {
  const parts = [];
  if ((tradeStats.recentCount || 0) >= 3) parts.push('active this week');
  if (completionRate >= 90) parts.push('excellent completion rate');
  else if (completionRate >= 70) parts.push('reliable completion rate');
  if (parseFloat(user.average_rating || 0) >= 4.5) parts.push('strong rating');
  if ((user.positive_feedback || 0) > 0 && !(user.negative_feedback || 0)) parts.push('no negative feedback on record');
  if (!parts.length) parts.push('meets this slot\'s activity and reliability requirements');
  return parts.join(', ').replace(/^./, c => c.toUpperCase()) + '.';
}

function isActiveWithinDays(user, days) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const last = new Date(user.last_seen_at || user.last_login || 0).getTime();
  return last >= cutoff;
}

function isBanned(user) {
  return !user || user.account_status === 'banned' || !!user.has_warning;
}

function isOnlineNow(user, minutes = ONLINE_WITHIN_MINUTES) {
  const cutoff = Date.now() - minutes * 60 * 1000;
  const last = new Date(user.last_seen_at || user.last_login || 0).getTime();
  return last >= cutoff;
}

function isEligibleEstablished(user, recentCount) {
  if (isBanned(user)) return false;
  if ((user.total_trades || 0) < ESTABLISHED_MIN_TRADES) return false;
  if ((user.completion_rate ?? 0) < ESTABLISHED_MIN_COMPLETION) return false;
  if (!isActiveWithinDays(user, ACTIVE_WITHIN_DAYS)) return false;
  return true;
}

function isEligibleGiftCard(user, gcStats) {
  if (isBanned(user)) return false;
  if (!gcStats || gcStats.total < GIFTCARD_MIN_TRADES) return false;
  if (gcStats.completionRate === null || gcStats.completionRate < GIFTCARD_MIN_COMPLETION) return false;
  if (!isActiveWithinDays(user, ACTIVE_WITHIN_DAYS)) return false;
  return true;
}

function isEligibleRising(user, recentCount, alreadySelectedIds) {
  if (isBanned(user)) return false;
  if (alreadySelectedIds.has(user.id)) return false;
  const trades = user.total_trades || 0;
  if (trades < 1 || trades >= RISING_MAX_TRADES) return false;
  if ((user.completion_rate ?? 0) < RISING_MIN_COMPLETION) return false;
  if (parseFloat(user.average_rating || 0) > 0 && parseFloat(user.average_rating) < RISING_MIN_RATING) return false;
  if (recentCount < 1) return false; // must have a recent completed trade, not just an old one
  return true;
}

function buildCandidate(user, role, tradeStats, overrides = {}) {
  const { completionOverride, tradesOverride, giftCardStats } = overrides;
  const { score, breakdown } = computeScore(user, tradeStats, { completionOverride, tradesOverride });
  const completionRate = completionOverride ?? (user.completion_rate ?? 0);
  return {
    user_id: user.id,
    username: user.username,
    country: user.country || null,
    role, // 'buyer' | 'seller' | null
    total_trades: tradesOverride ?? (user.total_trades || 0),
    recent_trades: tradeStats.recentCount || 0,
    average_rating: parseFloat(user.average_rating || 0),
    positive_feedback: user.positive_feedback || 0,
    negative_feedback: user.negative_feedback || 0,
    completion_rate: completionOverride ?? (user.completion_rate ?? null),
    gift_card_trades: giftCardStats ? giftCardStats.total : undefined,
    reason: buildReason(user, tradeStats, completionRate),
    score,
    breakdown,
  };
}

// ── Candidate pools per slot ─────────────────────────────────────────────────
// 'buy_bitcoin_global' historically means "the Buy Bitcoin page's featured
// trader" — i.e. the SELLER a buyer would transact with, across every country
// (not scoped to one, per this redesign). 'sell_bitcoin_gh' mirrors that on
// the Sell page: the Ghana BUYER a seller would transact with, filtered to
// Ghana's own MTN Mobile Money rail (existing product decision, preserved).
async function getCandidates(slot) {
  if (!SLOTS.includes(slot)) throw new Error(`Unknown slot: ${slot}`);

  const currentWinners = await getCurrentWinners();
  const alreadySelectedIds = new Set(Object.values(currentWinners).map(w => w.user_id).filter(Boolean));

  if (slot === 'gift_card') {
    const listings = await fetchActiveGiftCardListings();
    const sellerIds = [...new Set(listings.map(l => l.seller_id).filter(Boolean))];
    const users = await fetchUsersByIds(sellerIds);
    const tradeStats = await fetchRecentTradeStats(sellerIds, RECENT_TRADE_WINDOW_DAYS);
    const gcStats = await fetchGiftCardStats(sellerIds);
    const ranked = [];
    for (const id of sellerIds) {
      const user = users[id];
      const gc = gcStats[id];
      if (!isEligibleGiftCard(user, gc)) continue;
      ranked.push(buildCandidate(user, 'seller', tradeStats[id] || { recentCount: 0, durations: [] }, {
        completionOverride: gc.completionRate, tradesOverride: gc.total, giftCardStats: gc,
      }));
    }
    return ranked.sort((a, b) => b.score - a.score);
  }

  if (slot === 'buy_bitcoin_ng') {
    const listings = await fetchActiveBtcListings();
    const sellListingsNg = listings.filter(l =>
      (l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN') &&
      (l.country || '').toUpperCase() === 'NG');
    const sellerIds = [...new Set(sellListingsNg.map(l => l.seller_id).filter(Boolean))];
    const users = await fetchUsersByIds(sellerIds);
    const tradeStats = await fetchRecentTradeStats(sellerIds, RECENT_TRADE_WINDOW_DAYS);
    return rankPool(sellerIds, users, tradeStats, 'seller', isEligibleEstablished);
  }

  if (slot === 'sell_bitcoin_gh' || slot === 'sell_bitcoin_ke') {
    const cc = slot === 'sell_bitcoin_gh' ? 'GH' : 'KE';
    const listings = await fetchActiveBtcListings();
    const buyListingsCc = listings.filter(l =>
      (l.listing_type === 'BUY' || l.listing_type === 'BUY_BITCOIN') &&
      (l.country || '').toUpperCase() === cc);
    const local = COUNTRY_LOCAL_PAYMENT[cc];
    const filtered = buyListingsCc.filter(l => String(l.payment_method || '').toLowerCase().includes(local));
    const pool = filtered.length ? filtered : buyListingsCc; // fall back to all of that country's buyers if none use the local rail yet
    const buyerIds = [...new Set(pool.map(l => l.seller_id).filter(Boolean))];
    const users = await fetchUsersByIds(buyerIds);
    const tradeStats = await fetchRecentTradeStats(buyerIds, RECENT_TRADE_WINDOW_DAYS);
    return rankPool(buyerIds, users, tradeStats, 'buyer', isEligibleEstablished);
  }

  if (slot === 'rising_trader') {
    // Broader net than "has an active listing right now" — pulls in anyone
    // who appears as buyer or seller in a recent completed trade, since a
    // promising newer trader may not have a listing live at this exact
    // moment but has clearly demonstrated real, recent, successful activity.
    const since = new Date(Date.now() - RISING_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: asBuyer }, { data: asSeller }] = await Promise.all([
      supabaseAdmin.from('trades').select('buyer_id').eq('status', 'COMPLETED').gte('completed_at', since),
      supabaseAdmin.from('trades').select('seller_id').eq('status', 'COMPLETED').gte('completed_at', since),
    ]);
    const ids = [...new Set([...(asBuyer || []).map(t => t.buyer_id), ...(asSeller || []).map(t => t.seller_id)].filter(Boolean))];
    const users = await fetchUsersByIds(ids);
    const tradeStats = await fetchRecentTradeStats(ids, RISING_RECENT_WINDOW_DAYS);
    const ranked = [];
    for (const id of ids) {
      const user = users[id];
      const stats = tradeStats[id] || { recentCount: 0, durations: [] };
      if (!isEligibleRising(user, stats.recentCount, alreadySelectedIds)) continue;
      ranked.push(buildCandidate(user, null, stats));
    }
    return ranked.sort((a, b) => b.score - a.score);
  }

  return [];
}

function rankPool(ids, users, tradeStatsMap, role, eligibilityFn, dedupe = true) {
  const ranked = [];
  for (const id of ids) {
    const user = users[id];
    const stats = tradeStatsMap[id] || { recentCount: 0, durations: [] };
    if (!eligibilityFn(user, stats.recentCount)) continue;
    ranked.push(buildCandidate(user, role, stats));
  }
  ranked.sort((a, b) => b.score - a.score);
  return dedupe ? ranked : ranked; // kept as a named param for clarity at call sites (kenya_market merges two pools itself)
}

// ── Current winners (what's actually displayed publicly right now) ──────────
// The trader_of_week row's total_trades/average_rating are a snapshot from when
// the winner was chosen, and it has no feedback columns at all — so the public
// banner used to show 0 / 0 feedback and a stale trade count. Re-read those
// four numbers live from `users` so the badge always matches the trader's
// profile (feedback = total_feedback_count, which includes verified P2P-migrated
// reputation, falling back to positive_feedback).
async function getCurrentWinners() {
  const { data, error } = await supabaseAdmin.from('trader_of_week').select('*').in('category', SLOTS);
  if (error) return {};
  const rows = data || [];

  const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  let liveById = {};
  if (ids.length) {
    const { data: us } = await supabaseAdmin.from('users')
      .select('id, total_trades, average_rating, positive_feedback, negative_feedback, total_feedback_count')
      .in('id', ids);
    liveById = Object.fromEntries((us || []).map(u => [u.id, u]));
  }

  return Object.fromEntries(rows.map(r => {
    const u = liveById[r.user_id] || {};
    return [r.category, {
      ...r,
      total_trades:         u.total_trades ?? r.total_trades ?? 0,
      average_rating:       u.average_rating ?? r.average_rating ?? 0,
      positive_feedback:    u.positive_feedback ?? 0,
      negative_feedback:    u.negative_feedback ?? 0,
      total_feedback_count: u.total_feedback_count ?? u.positive_feedback ?? 0,
    }];
  }));
}

// ── Validate a manual (admin-chosen) selection ───────────────────────────────
// Deliberately does NOT require the trader to clear the ranking thresholds
// (trade count / completion rate) — a manual pick is the admin's call, not
// the algorithm's. It DOES still require: the username to be a real account,
// not banned, and to have a genuinely active listing matching the slot's
// market/category (so a pin can never point at a dead offer). Never silently
// picks a different trader — throws a specific, actionable error instead.
async function validateManualSelection(slot, username) {
  if (!SLOTS.includes(slot)) throw new Error(`Unknown slot: ${slot}`);
  if (slot === 'rising_trader') {
    throw new Error('Rising Trader must be selected from the ranked candidate list (its eligibility is based on recent trade activity, not a listing) — use selectWinner with a userId from getCandidates instead.');
  }

  const { data: user, error: uErr } = await supabaseAdmin.from('users')
    .select('id, username, country, total_trades, completion_rate, average_rating, positive_feedback, negative_feedback, account_status, has_warning')
    .ilike('username', username).maybeSingle();
  if (uErr) throw new Error(`User lookup failed: ${uErr.message}`);
  if (!user) throw new Error(`No PRAQEN account found with username "${username}". Check the spelling — the selection was NOT made.`);
  if (isBanned(user)) throw new Error(`${user.username} is banned or has an active severe warning and cannot be featured. The selection was NOT made.`);

  let listing = null, warning = null;

  if (slot === 'gift_card') {
    const gcListings = await fetchActiveGiftCardListings();
    listing = gcListings.find(l => l.seller_id === user.id) || null;
    if (!listing) throw new Error(`${user.username} has no active Gift Card listing right now — cannot be featured in the Gift Card slot. The selection was NOT made.`);
  } else if (slot === 'buy_bitcoin_ng') {
    const listings = await fetchActiveBtcListings();
    listing = listings.find(l => l.seller_id === user.id && (l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN') && (l.country || '').toUpperCase() === 'NG') || null;
    if (!listing) throw new Error(`${user.username} has no active SELL Bitcoin listing in Nigeria right now — cannot be featured in Buy Bitcoin — Nigeria. The selection was NOT made.`);
  } else if (slot === 'sell_bitcoin_gh' || slot === 'sell_bitcoin_ke') {
    const cc = slot === 'sell_bitcoin_gh' ? 'GH' : 'KE';
    const countryName = cc === 'GH' ? 'Ghana' : 'Kenya';
    const local = COUNTRY_LOCAL_PAYMENT[cc];
    const listings = await fetchActiveBtcListings();
    const countryListings = listings.filter(l => l.seller_id === user.id && (l.listing_type === 'BUY' || l.listing_type === 'BUY_BITCOIN') && (l.country || '').toUpperCase() === cc);
    if (!countryListings.length) throw new Error(`${user.username} has no active BUY Bitcoin listing in ${countryName} right now — cannot be featured in Sell Bitcoin — ${countryName}. The selection was NOT made.`);
    listing = countryListings.find(l => String(l.payment_method || '').toLowerCase().includes(local)) || countryListings[0];
    if (!String(listing.payment_method || '').toLowerCase().includes(local)) {
      warning = `No active ${local.toUpperCase()}-specific listing found for ${user.username} — using their active "${listing.payment_method || 'unspecified'}" ${countryName} listing instead.`;
    }
  }

  const tradeStats = (await fetchRecentTradeStats([user.id], RECENT_TRADE_WINDOW_DAYS))[user.id];
  const candidate = buildCandidate(user, 'seller', tradeStats);
  candidate.listing_id = listing?.id || null;
  candidate.country = listing?.country || user.country || null;
  candidate.manual = true;
  return { candidate, warning };
}

// ── Admin selects a winner for a slot ────────────────────────────────────────
// Writes the current-winner row (what the public endpoint reads) AND an
// append-only history row (never updated afterward). Shared by selectWinner
// (admin picks, always pinned=true) and runAutoRotation (algorithmic picks,
// always pinned=false) — the only two writers of trader_of_week.
async function persistWinner({ slot, chosen, adminId = null, adminUsername = null, expiresInDays = 7, pinned }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const row = {
    category: slot,
    user_id: chosen.user_id,
    username: chosen.username,
    total_trades: chosen.total_trades,
    average_rating: chosen.average_rating,
    country: chosen.country,
    selected_at: nowIso,
    next_rotation_at: expiresAt,
    pinned,
    // selected_by / selected_by_username / score / reason already existed on this
    // table from an earlier, untracked manual schema change — reused here rather
    // than adding duplicate pinned_by/pinned_by_username columns.
    selected_by: adminId,
    selected_by_username: adminUsername,
    score: chosen.score,
    reason: chosen.reason,
    pin_expires_at: expiresAt,
    stats_snapshot: chosen,
  };

  const { error: upsertErr } = await supabaseAdmin.from('trader_of_week').upsert(row, { onConflict: 'category' });
  if (upsertErr) throw upsertErr;

  const { error: histErr } = await supabaseAdmin.from('trader_of_week_history').insert({
    category: slot,
    user_id: chosen.user_id,
    username: chosen.username,
    selected_by: adminId,
    selected_by_username: adminUsername,
    selected_at: nowIso,
    expires_at: expiresAt,
    stats_snapshot: chosen,
  });
  if (histErr) console.error('[traderOfWeek] history insert failed (current winner was still saved):', histErr.message);

  return row;
}

// expiresInDays defaults to the 7-day recognition period but is left renewable
// by simply selecting again. Two ways to call this: pass `username` for a
// manual admin pick (bypasses ranking thresholds entirely, still validates the
// account/listing are real — see validateManualSelection), or pass `userId` to
// select from the ranked getCandidates() list (used for Rising Trader, and
// still available for the other 4 slots if you want a ranking-backed pick
// instead of typing a name).
async function selectWinner({ slot, userId, username, adminId, adminUsername, expiresInDays = 7 }) {
  if (!SLOTS.includes(slot)) throw new Error(`Unknown slot: ${slot}`);

  let chosen, warning = null;
  if (username) {
    const result = await validateManualSelection(slot, username);
    chosen = result.candidate;
    warning = result.warning;
  } else {
    const candidates = await getCandidates(slot);
    chosen = candidates.find(c => c.user_id === userId);
    if (!chosen) {
      throw new Error('Selected trader is not a currently eligible candidate for this slot. Re-check the candidate list — eligibility is computed live and may have changed.');
    }
  }

  // A manual admin pick is always a hard pin (pinned=true) — see runAutoRotation,
  // which skips any slot with pinned=true so this is never silently overwritten.
  const row = await persistWinner({ slot, chosen, adminId, adminUsername, expiresInDays, pinned: true });
  return { ...row, warning };
}

// Highest-scoring eligible candidate for `slot` who is online right now
// (isOnlineNow), or null if none of them are. getCandidates() already sorts by
// score desc and already excludes anyone holding another slot's current
// winner, so this just walks that list looking for the first one online.
async function pickOnlineCandidate(slot) {
  const candidates = await getCandidates(slot);
  if (!candidates.length) return null;
  const users = await fetchUsersByIds(candidates.map(c => c.user_id));
  for (const c of candidates) {
    const u = users[c.user_id];
    if (u && isOnlineNow(u)) return c;
  }
  return null;
}

// Rotates every UNPINNED slot whose ROTATION_HOURS window has elapsed to the
// next eligible, currently-online candidate. Called on a timer from
// server.js. Any slot an admin has hard-pinned (pinned=true — via the select
// endpoint or the pin_trader_of_week() SQL helper) is left completely alone,
// so this never overrides a deliberate admin choice; it only fills in slots
// nobody has claimed. If no eligible candidate is online on a given tick, the
// existing winner (if any) is left in place and retried on the next tick,
// rather than leaving the slot empty.
async function runAutoRotation() {
  const now = Date.now();
  const currentWinners = await getCurrentWinners();

  for (const slot of SLOTS) {
    const winner = currentWinners[slot];
    if (winner?.pinned) continue;

    const dueAt = winner?.next_rotation_at ? new Date(winner.next_rotation_at).getTime() : 0;
    if (winner && dueAt > now) continue;

    try {
      const candidate = await pickOnlineCandidate(slot);
      if (!candidate) {
        console.log(`[traderOfWeek] auto-rotation: no online eligible candidate for "${slot}" — leaving as-is, will retry`);
        continue;
      }
      await persistWinner({ slot, chosen: candidate, expiresInDays: ROTATION_HOURS / 24, pinned: false, adminUsername: 'auto-rotation' });
      console.log(`[traderOfWeek] auto-rotation: "${slot}" -> ${candidate.username} (next check in ${ROTATION_HOURS}h)`);
    } catch (err) {
      console.error(`[traderOfWeek] auto-rotation failed for "${slot}":`, err.message);
    }
  }
}

module.exports = { SLOTS, ROTATION_HOURS, getCandidates, getCurrentWinners, selectWinner, validateManualSelection, runAutoRotation };
