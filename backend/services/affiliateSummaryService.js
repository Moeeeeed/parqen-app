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
// `rate` is the % of each trade value. Keep in step with frontend/src/pages/partnerShared.js.
const LEVELS = [
  { name: 'Explorer',   rate: 0.10, users: 5,  volume: 50,    keepUsers: 3,  keepVolume: 25 },
  { name: 'Builder',    rate: 0.12, users: 10, volume: 1000,  keepUsers: 5,  keepVolume: 500 },
  { name: 'Titan',      rate: 0.15, users: 20, volume: 10000, keepUsers: 10, keepVolume: 5000 },
  { name: 'Ambassador', rate: 0.20, users: 50, volume: 50000, keepUsers: 25, keepVolume: 25000 },
];

// A brought user is "active" once their own lifetime trade volume reaches this.
const ACTIVE_MIN_USD = 20;

const CHUNK = 50;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Highest level whose unlock numbers are BOTH met. -1 = none yet.
function levelIndexFor(activeUsers, qualifiedVolume) {
  let idx = -1;
  LEVELS.forEach((l, i) => {
    if (activeUsers >= l.users && qualifiedVolume >= l.volume) idx = i;
  });
  return idx;
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
  const levelIdx = levelIndexFor(activeUsers, qualifiedVolume);
  const level = levelIdx >= 0 ? { index: levelIdx, name: LEVELS[levelIdx].name, rate: LEVELS[levelIdx].rate } : null;

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
    next,
    levels: LEVELS.map((l, i) => ({ index: i, ...l })),
    users,
    invited_by: invitedBy,
  };
}

module.exports = { LEVELS, ACTIVE_MIN_USD, levelIndexFor, tradeQualifies, aggregate, getAffiliateSummary };
