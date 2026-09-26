import {
  getCachedActiveTrades, setCachedActiveTrades, clearCachedActiveTrades, isGiftCardTrade,
} from './activeTradesCache';

const login = (id) => localStorage.setItem('user', JSON.stringify({ id }));
const p2p = { id: 't1', status: 'PAYMENT_SENT', amount_btc: 0.01, listing: { listing_type: 'SELL_BTC' } };
const gift = { id: 't2', status: 'PAYMENT_SENT', gift_card_brand: 'Amazon', listing: { listing_type: 'SELL_GIFT_CARD' } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete window._praqen_active_trades;
});

describe('active trades cache: privacy between users', () => {
  it('shows a user their own cached trades', () => {
    login('A');
    setCachedActiveTrades([p2p]);
    expect(getCachedActiveTrades('p2p')).toEqual([p2p]);
  });

  it('does NOT show user A trades to user B logging in on the same tab', () => {
    login('A');
    setCachedActiveTrades([p2p, gift]);
    login('B'); // logout + login as someone else, no page reload
    expect(getCachedActiveTrades('p2p')).toEqual([]);
    expect(getCachedActiveTrades('gift-card')).toEqual([]);
    expect(getCachedActiveTrades()).toEqual([]);
  });

  it('forgets A data completely once B has looked (nothing left in storage)', () => {
    login('A');
    setCachedActiveTrades([p2p]);
    login('B');
    getCachedActiveTrades('p2p');
    expect(sessionStorage.getItem('praqen_cached_active_trades')).toBeNull();
    expect(window._praqen_active_trades).toBeUndefined();
    login('A'); // A comes back: the old copy must be gone, not resurrected
    expect(getCachedActiveTrades('p2p')).toEqual([]);
  });

  it('also works when only sessionStorage survives (page reloaded)', () => {
    login('A');
    setCachedActiveTrades([p2p]);
    delete window._praqen_active_trades;
    expect(getCachedActiveTrades('p2p')).toEqual([p2p]);
    login('B');
    delete window._praqen_active_trades;
    expect(getCachedActiveTrades('p2p')).toEqual([]);
  });

  it('shows nothing when nobody is logged in', () => {
    login('A');
    setCachedActiveTrades([p2p]);
    localStorage.removeItem('user');
    expect(getCachedActiveTrades('p2p')).toEqual([]);
  });

  it('does not store anything when nobody is logged in', () => {
    setCachedActiveTrades([p2p]);
    expect(sessionStorage.getItem('praqen_cached_active_trades')).toBeNull();
    expect(window._praqen_active_trades).toBeUndefined();
  });

  it('clearCachedActiveTrades (used on logout) empties both memory and storage', () => {
    login('A');
    setCachedActiveTrades([p2p]);
    clearCachedActiveTrades();
    expect(sessionStorage.getItem('praqen_cached_active_trades')).toBeNull();
    expect(getCachedActiveTrades('p2p')).toEqual([]);
  });

  it('an old-format (untagged) list left by the previous version is ignored and removed', () => {
    login('A');
    sessionStorage.setItem('praqen_cached_active_trades', JSON.stringify([p2p]));
    expect(getCachedActiveTrades('p2p')).toEqual([]);
    expect(sessionStorage.getItem('praqen_cached_active_trades')).toBeNull();
  });

  it('survives corrupt storage without throwing', () => {
    login('A');
    sessionStorage.setItem('praqen_cached_active_trades', '{not json');
    expect(getCachedActiveTrades('p2p')).toEqual([]);
    localStorage.setItem('user', '{broken');
    expect(getCachedActiveTrades('p2p')).toEqual([]);
  });
});

describe('active trades cache: category separation', () => {
  it('keeps P2P and gift card trades apart', () => {
    login('A');
    setCachedActiveTrades([p2p, gift]);
    expect(getCachedActiveTrades('p2p')).toEqual([p2p]);
    expect(getCachedActiveTrades('gift-card')).toEqual([gift]);
    expect(getCachedActiveTrades()).toHaveLength(2);
  });

  it('isGiftCardTrade recognises brands and listing types, and treats bitcoin brands as P2P', () => {
    expect(isGiftCardTrade(gift)).toBe(true);
    expect(isGiftCardTrade({ trade_type: 'BUY_GIFT_CARD' })).toBe(true);
    expect(isGiftCardTrade({ gift_card_brand: 'bitcoin' })).toBe(false);
    expect(isGiftCardTrade(p2p)).toBe(false);
    expect(isGiftCardTrade(null)).toBe(false);
  });
});
