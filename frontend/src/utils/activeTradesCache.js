const CACHE_KEY = 'praqen_cached_active_trades';

export const isGiftCardTrade = (trade) => {
  if (!trade) return false;
  const type = (trade.trade_type || '').toUpperCase();
  const listingType = (trade.listing?.listing_type || '').toUpperCase();
  const brand = (trade.gift_card_brand || '').toLowerCase().trim();
  const BTCBrands = ['bitcoin', 'btc', 'sell bitcoin', 'buy bitcoin', ''];

  return !!(
    type.includes('GIFT') ||
    listingType.includes('GIFT') ||
    (brand && !BTCBrands.includes(brand))
  );
};

export const getCachedActiveTrades = (category) => {
  try {
    let list = [];
    if (window._praqen_active_trades && Array.isArray(window._praqen_active_trades)) {
      list = window._praqen_active_trades;
    } else {
      const stored = sessionStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          window._praqen_active_trades = parsed;
          list = parsed;
        }
      }
    }
    if (category === 'p2p') {
      return list.filter(t => !isGiftCardTrade(t));
    }
    if (category === 'gift-card') {
      return list.filter(t => isGiftCardTrade(t));
    }
    return list;
  } catch (e) {}
  return [];
};

export const setCachedActiveTrades = (trades) => {
  try {
    const list = Array.isArray(trades) ? trades : [];
    window._praqen_active_trades = list;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch (e) {}
};
