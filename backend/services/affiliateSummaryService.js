// Affiliate summary — READ ONLY.
//
// Works out, for one affiliate, how many users they brought, how many are active,
// how much those users have traded, and which level that unlocks. Everything is
// computed straight from `users.referred_by` and the `trades` table. It never
// reads `users.total_referrals` (that counter changes meaning) and never reads
// `affiliate_earnings` (so the numbers keep moving even if commission creation
// is paused). It writes nothing and moves no money.

// Levels. `users` / `volume` = numbers needed to UNLOCK. `keepUsers` / `keepVolume`
// = numbers needed to KEEP the level once unlocked (enforced later, by the engine).
// `rate` is the affiliate's share of PRAQEN's own trading fee on their users'
// trades (NOT a % of the trade's own value) — e.g. rate 0.10 means the affiliate
// gets 10% of whatever fee PRAQEN earns on that trade, funded from PRAQEN's cut,
// never an extra charge to the trader. The live platform fee itself lives in
// tradeEscrowService.js (FEE_RATE) — see getPublicConfig() below, which reads it
// from there instead of duplicating the number here (a prior fee-rate duplicate
// drifting out of sync already caused a real incident, see tradeEscrowService.js).
// Keep in step with frontend/src/pages/partnerShared.js.
const LEVELS = [
  { name: 'Explorer',   rate: 0.10, users: 5,  volume: 50,    keepUsers: 3,  keepVolume: 50 },
  { name: 'Builder',    rate: 0.20, users: 15, volume: 5000,  keepUsers: 8,  keepVolume: 1000 },
  { name: 'Titan',      rate: 0.30, users: 50, volume: 10000, keepUsers: 25, keepVolume: 3000 },
  { name: 'Legendary',  rate: 0.40, users: 80, volume: 70000, keepUsers: 40, keepVolume: 20000 },
];

// A brought user is "active" once their own lifetime trade volume reaches this.
const ACTIVE_MIN_USD = 20;

// Builder (and ONLY Builder — Explorer unlocks free, Titan/Legendary unlock free
// once past Builder) requires a manual interview before it's actually granted.
// Hitting Builder's numbers alone just unlocks the ability to apply; the
// affiliate stays at Explorer's rate until an admin approves the application
// (affiliate_builder_applications table). See database/2026-09-27_affiliate_builder_applications.sql.
const BUILDER_INDEX = 1;

const CHUNK = 50;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Highest level whose unlock numbers are BOTH met. -1 = none yet.
// This is raw NUMERIC eligibility only — it does not know about the Builder
// interview gate. Use effectiveLevelIndex() below for the level actually granted.
function levelIndexFor(activeUsers, qualifiedVolume) {
  let idx = -1;
  LEVELS.forEach((l, i) => {
    if (activeUsers >= l.users && qualifiedVolume >= l.volume) idx = i;
  });
  return idx;
}

// The most recent Builder application for this user, or null if they've never applied.
// Wrapped in a full try/catch (not just an error-code check): a missing table
// (migration not run yet) or a query-builder shape that doesn't support every
// chained method here must degrade to "never applied", never crash the whole
// summary over it — same defensive pattern as the rest of this file.
async function getBuilderApplication(supabase, userId) {
  try {
    const { data, error } = await supabase
      .from('affiliate_builder_applications')
      .select('id, status, active_users_at_apply, qualified_volume_at_apply, applied_at, reviewed_at, rejection_reason')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch (e) {
    return null;
  }
}

// Numeric eligibility capped by the Builder interview gate: reaching Builder's
// (or a higher level's) numbers only grants that level once Builder has been
// approved. Below Builder, or once approved, this matches levelIndexFor exactly.
function effectiveLevelIndex(eligibleIdx, builderApproved) {
  if (eligibleIdx < BUILDER_INDEX) return eligibleIdx; // -1 or Explorer — gate doesn't apply
  return builderApproved ? eligibleIdx : (BUILDER_INDEX - 1); // capped at Explorer until approved
}

// Is this trade one that counts towards an affiliate's numbers?
// Real value must have moved: completed, fee collected, BTC or USDT, not a test
// trade, not a gift card, and not a dispute the seller won (that one refunds).
function tradeQualifies(t, giftListingIds) {
  if (!t || t.status !== 'COMPLETED') return false;
  if (t.is_test === true) return false;
  if (t.fee_status !== 'COLLECTED') return false;
  if (t.currency !== 'BTC' && t.currency !== 'USDT') return false;
  if (t.dispute_resolution && t.dispute_resolution !== 'BUYER_WINS') return false;
  if (t.gift_card_brand) return false;
  if (t.listing_id && giftListingIds.has(t.listing_id)) return false;
  const usd = Number(t.amount_usd);
  if (!(usd > 0)) return false;
  return true;
}

// PURE: given the affiliate, the users they brought and the candidate trades,
// return the per-user numbers and the totals. No I/O.
function aggregate({ affiliateId, referredIds, trades, giftListingIds }) {
  const referred = new Set(referredIds);
  const perUser = new Map();
  referredIds.forEach((id) => perUser.set(id, { volume: 0, trades: 0 }));

  // one entry per trade id (a trade can be fetched twice: once as buyer, once as seller)
  const seen = new Set();
  const good = [];
  for (const t of trades) {
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    if (!tradeQualifies(t, giftListingIds)) continue;
    // A trade with the affiliate themself never counts (stops self-dealing inflating levels).
    if (t.buyer_id === affiliateId || t.seller_id === affiliateId) continue;
    const parties = [t.buyer_id, t.seller_id].filter((p) => referred.has(p));
    if (parties.length === 0) continue;
    good.push({ t, parties });
    const usd = Number(t.amount_usd);
    // each brought user gets credit for their own side of the trade
    new Set(parties).forEach((p) => {
      const u = perUser.get(p);
      u.volume += usd;
      u.trades += 1;
    });
  }

  const active = new Set();
  perUser.forEach((u, id) => { if (u.volume >= ACTIVE_MIN_USD) active.add(id); });

  // Qualified volume = volume of trades where at least one side is an ACTIVE brought user, each trade once.
  let qualified = 0;
  let lifetime = 0;
  for (const { t, parties } of good) {
    const usd = Number(t.amount_usd);
    lifetime += usd;
    if (parties.some((p) => active.has(p))) qualified += usd;
  }

  return { perUser, active, qualifiedVolume: qualified, lifetimeVolume: lifetime };
}

async function fetchAll(makeQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function getAffiliateSummary(supabase, affiliateId, { cashEnabled = false } = {}) {
  // 1. who this affiliate brought (signup link), newest first
  const referredRows = await fetchAll(() => supabase
    .from('users')
    .select('id, username, country, created_at')
    .eq('referred_by', affiliateId)
    .order('created_at', { ascending: false }));
  const referredIds = referredRows.map((u) => u.id);

  // 2. who brought this affiliate
  let invitedBy = null;
  {
    const { data: me } = await supabase.from('users').select('referred_by').eq('id', affiliateId).maybeSingle();
    if (me && me.referred_by) {
      const { data: ref } = await supabase.from('users').select('id, username, country').eq('id', me.referred_by).maybeSingle();
      if (ref) invitedBy = { id: ref.id, username: ref.username, country: ref.country || null };
    }
  }

  // 3. their completed trades (as buyer or seller)
  const tradeCols = 'id, status, currency, amount_usd, fee_status, dispute_resolution, gift_card_brand, is_test, listing_id, buyer_id, seller_id, completed_at';
  const trades = [];
  for (const ids of chunks(referredIds, CHUNK)) {
    for (const side of ['buyer_id', 'seller_id']) {
      const rows = await fetchAll(() => supabase
        .from('trades')
        .select(tradeCols)
        .eq('status', 'COMPLETED')
        .eq('fee_status', 'COLLECTED')
        .in('currency', ['BTC', 'USDT'])
        .in(side, ids));
      trades.push(...rows);
    }
  }

  // 4. which of those trades are gift card trades (by their listing)
  const listingIds = [...new Set(trades.map((t) => t.listing_id).filter(Boolean))];
  const giftListingIds = new Set();
  for (const ids of chunks(listingIds, 200)) {
    const { data, error } = await supabase.from('listings').select('id, listing_type').in('id', ids);
    if (error) throw new Error(error.message);
    (data || []).forEach((l) => {
      if (String(l.listing_type || '').toUpperCase().includes('GIFT_CARD')) giftListingIds.add(l.id);
    });
  }

  const agg = aggregate({ affiliateId, referredIds, trades, giftListingIds });

  const users = referredRows.map((u) => {
    const s = agg.perUser.get(u.id) || { volume: 0, trades: 0 };
    return {
      id: u.id,
      username: u.username,
      country: u.country || null,
      joined: u.created_at,
      trades: s.trades,
      volume_usd: round2(s.volume),
      active: agg.active.has(u.id),
    };
  });

  const activeUsers = agg.active.size;
  const qualifiedVolume = round2(agg.qualifiedVolume);
  const eligibleIdx = levelIndexFor(activeUsers, qualifiedVolume);

  const builderApp = await getBuilderApplication(supabase, affiliateId);
  const builderApproved = builderApp?.status === 'approved';
  const levelIdx = effectiveLevelIndex(eligibleIdx, builderApproved);
  const level = levelIdx >= 0 ? { index: levelIdx, name: LEVELS[levelIdx].name, rate: LEVELS[levelIdx].rate } : null;

  // Builder-gate UI state: whether the numbers qualify for Builder+ yet, and
  // what the page should show — "interview required" (not there yet), "apply"
  // (qualifies, no application on file / previously rejected), "pending"
  // (already applied, awaiting review), or null once approved (normal display).
  const builderEligible = eligibleIdx >= BUILDER_INDEX;
  const builderApplication = {
    eligible: builderEligible,
    status: builderApp?.status || null,
    can_apply: builderEligible && (!builderApp || builderApp.status === 'rejected'),
    rejection_reason: builderApp?.status === 'rejected' ? (builderApp.rejection_reason || null) : null,
  };

  const nextIdx = levelIdx + 1;
  let next = null;
  if (nextIdx < LEVELS.length) {
    const n = LEVELS[nextIdx];
    next = {
      index: nextIdx,
      name: n.name,
      rate: n.rate,
      need_users: n.users,
      need_volume: n.volume,
      users_missing: Math.max(0, n.users - activeUsers),
      volume_missing: round2(Math.max(0, n.volume - qualifiedVolume)),
      users_progress: Math.min(1, activeUsers / n.users),
      volume_progress: Math.min(1, qualifiedVolume / n.volume),
    };
  }

  return {
    cash_enabled: !!cashEnabled,
    active_min_usd: ACTIVE_MIN_USD,
    totals: {
      users_brought: referredIds.length,
      active_users: activeUsers,
      qualified_volume_usd: qualifiedVolume,
      lifetime_volume_usd: round2(agg.lifetimeVolume),
    },
    // Getting started (no level yet): the Explorer rate still applies from the first trade.
    level,
    rate_now: LEVELS[Math.max(0, levelIdx)].rate,
    builder_application: builderApplication,
    next,
    levels: LEVELS.map((l, i) => ({ index: i, ...l })),
    users,
    invited_by: invitedBy,
  };
}

// ── Payout switch ─────────────────────────────────────────────────────────
// Money features stay OFF unless REFERRAL_PAYOUTS_ENABLED is exactly "true".
function cashEnabled() {
  return process.env.REFERRAL_PAYOUTS_ENABLED === 'true';
}

// Public program rules (no user data). The page reads these instead of hard-coding them.
function getPublicConfig() {
  // Lazy require — tradeEscrowService is the single source of truth for the
  // platform fee rate (see the LEVELS comment above); avoids a second
  // hardcoded copy on the frontend that could drift out of sync.
  let feeRate = 0.02; // crypto P2P fallback, matches tradeEscrowService's FEE_RATE
  try { feeRate = require('./tradeEscrowService').feeRateFor(false); } catch (_) { /* keep fallback */ }
  return {
    cash_enabled: cashEnabled(),
    active_min_usd: ACTIVE_MIN_USD,
    fee_rate: feeRate,
    levels: LEVELS.map((l, i) => ({ index: i, ...l })),
  };
}

// ── Public leaderboard: ranked by ACTIVE USERS (never by money) ───────────
// One pass over all referred users and all qualifying trades, then the same
// per-affiliate rules as getAffiliateSummary. Cached for a few minutes.
let _lbCache = null;
const LB_TTL_MS = 5 * 60 * 1000;

// One retry for a passing network hiccup, and if the database still cannot be reached the
// last good list is served instead of an error (the board is not money, so slightly old is fine).
async function getLeaderboard(supabase, { limit = 10, now = Date.now(), retryDelayMs = 400 } = {}) {
  if (_lbCache && now - _lbCache.ts < LB_TTL_MS && _lbCache.limit === limit) return _lbCache.data;
  try {
    try {
      return await _buildLeaderboard(supabase, { limit, now });
    } catch (first) {
      await new Promise((r) => setTimeout(r, retryDelayMs));
      return await _buildLeaderboard(supabase, { limit, now });
    }
  } catch (err) {
    if (_lbCache && _lbCache.limit === limit) return _lbCache.data;
    throw err;
  }
}

async function _buildLeaderboard(supabase, { limit, now }) {

  const referredRows = await fetchAll(() => supabase.from('users').select('id, referred_by').not('referred_by', 'is', null));
  const byAff = new Map();
  const affOf = new Map();
  referredRows.forEach((u) => {
    if (!byAff.has(u.referred_by)) byAff.set(u.referred_by, []);
    byAff.get(u.referred_by).push(u.id);
    affOf.set(u.id, u.referred_by);
  });

  const trades = await fetchAll(() => supabase
    .from('trades')
    .select('id, status, currency, amount_usd, fee_status, dispute_resolution, gift_card_brand, is_test, listing_id, buyer_id, seller_id')
    .eq('status', 'COMPLETED')
    .eq('fee_status', 'COLLECTED')
    .in('currency', ['BTC', 'USDT']));

  const listingIds = [...new Set(trades.map((t) => t.listing_id).filter(Boolean))];
  const giftListingIds = new Set();
  for (const ids of chunks(listingIds, 200)) {
    const { data, error } = await supabase.from('listings').select('id, listing_type').in('id', ids);
    if (error) throw new Error(error.message);
    (data || []).forEach((l) => { if (String(l.listing_type || '').toUpperCase().includes('GIFT_CARD')) giftListingIds.add(l.id); });
  }

  // group trades by the affiliate(s) of each party
  const tradesByAff = new Map();
  for (const t of trades) {
    const affs = new Set([affOf.get(t.buyer_id), affOf.get(t.seller_id)].filter(Boolean));
    affs.forEach((a) => { if (!tradesByAff.has(a)) tradesByAff.set(a, []); tradesByAff.get(a).push(t); });
  }

  const rows = [];
  byAff.forEach((referredIds, affiliateId) => {
    const agg = aggregate({ affiliateId, referredIds, trades: tradesByAff.get(affiliateId) || [], giftListingIds });
    const active = agg.active.size;
    if (active < 1) return; // the board lists people who actually brought traders
    const q = round2(agg.qualifiedVolume);
    const lvl = levelIndexFor(active, q);
    rows.push({ id: affiliateId, users_brought: referredIds.length, active_users: active, qualified_volume_usd: q, level: lvl >= 0 ? LEVELS[lvl].name : null });
  });
  rows.sort((a, b) => b.active_users - a.active_users || b.qualified_volume_usd - a.qualified_volume_usd || b.users_brought - a.users_brought);
  const top = rows.slice(0, limit);

  const profiles = new Map();
  if (top.length) {
    const { data, error } = await supabase.from('users').select('id, username, country').in('id', top.map((r) => r.id));
    if (error) throw new Error(error.message);
    (data || []).forEach((u) => profiles.set(u.id, u));
  }
  const data = top.map((r, i) => ({
    rank: i + 1,
    id: r.id,
    username: (profiles.get(r.id) || {}).username || 'Affiliate',
    country: (profiles.get(r.id) || {}).country || null,
    level: r.level,
    users_brought: r.users_brought,
    active_users: r.active_users,
    qualified_volume_usd: r.qualified_volume_usd,
  }));
  _lbCache = { ts: now, limit, data };
  return data;
}
function _clearLeaderboardCache() { _lbCache = null; }

module.exports = { LEVELS, ACTIVE_MIN_USD, BUILDER_INDEX, levelIndexFor, effectiveLevelIndex, getBuilderApplication, tradeQualifies, aggregate, getAffiliateSummary, cashEnabled, getPublicConfig, getLeaderboard, _clearLeaderboardCache };

