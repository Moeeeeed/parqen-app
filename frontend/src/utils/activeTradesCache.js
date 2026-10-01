// Remembers the signed-in user's active trades so the trade pages can show them instantly
// while the fresh list loads.
//
// The cache is ALWAYS tied to the user it belongs to (their id is stored with the list and
// checked on every read), and it is cleared on logout. Without that, on a shared phone or
// browser tab the next person to log in would briefly see the previous user's trades.
const CACHE_KEY = 'praqen_cached_active_trades';

// Who is logged in right now (the app keeps the user object in localStorage).
const currentUserId = () => {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    return u && u.id ? String(u.id) : null;
  } catch (e) {
    return null;
  }
};

export const isGiftCardTrade = (trade) => {
  if (!trade) return false;
  const type = (trade.trade_type || '').toUpperCase();
  const listingType = (trade.listing?.listing_type || '').toUpperCase();
  const brand = (trade.gift_card_brand || '').toLowerCase().trim();
  const asset = (trade.asset || trade.listing?.asset || '').toUpperCase();

  const P2PBrands = ['bitcoin', 'btc', 'usdt', 'tether', 'sell bitcoin', 'buy bitcoin', 'sell usdt', 'buy usdt', 'crypto', ''];

  return !!(
    type.includes('GIFT') ||
    listingType.includes('GIFT') ||
    (brand && !P2PBrands.includes(brand))
  );
};

export const clearCachedActiveTrades = () => {
  try { delete window._praqen_active_trades; } catch (e) { /* ignore */ }
  try { sessionStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
};

export const getCachedActiveTrades = (category) => {
  try {
    const uid = currentUserId();
    if (!uid) return []; // nobody logged in: never show anything

    let entry = window._praqen_active_trades;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      entry = null;
      const stored = sessionStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Only the { uid, list } shape is valid. Anything else (an old un-tagged list) is dropped.
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.list)) {
          entry = parsed;
          window._praqen_active_trades = parsed;
        } else {
          sessionStorage.removeItem(CACHE_KEY);
        }
      }
    }
    // Belongs to somebody else: throw it away.
    if (!entry || entry.uid !== uid) {
      if (entry) clearCachedActiveTrades();
      return [];
    }

    const list = Array.isArray(entry.list) ? entry.list : [];
    if (category === 'p2p') return list.filter((t) => !isGiftCardTrade(t));
    if (category === 'gift-card') return list.filter((t) => isGiftCardTrade(t));
    return list;
  } catch (e) { /* fall through */ }
  return [];
};

export const setCachedActiveTrades = (trades) => {
  try {
    const uid = currentUserId();
    if (!uid) { clearCachedActiveTrades(); return; }
    const entry = { uid, list: Array.isArray(trades) ? trades : [] };
    window._praqen_active_trades = entry;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch (e) { /* ignore */ }
};
