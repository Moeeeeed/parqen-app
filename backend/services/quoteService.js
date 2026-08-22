const crypto = require('crypto');

// In-memory store. Replace with Redis in production.
const quotes = new Map();

// Purge quotes that expired more than 2 minutes ago
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [id, q] of quotes.entries()) {
    if (q.expiresAt < cutoff) quotes.delete(id);
  }
}, 60000);

// Cached fallback rates refreshed on each successful fetch
let _cachedBtcUsd = 88000;
let _cachedFxRates = {};

// Common currency fallbacks (rough values, only used if APIs are unreachable)
const STATIC_FX = {
  USD: 1, GHS: 15.5, NGN: 1600, KES: 130, ZAR: 18.5,
  UGX: 3700, TZS: 2550, EUR: 0.92, GBP: 0.79, XOF: 600, XAF: 600,
};

function getFxRate(currency) {
  return _cachedFxRates[currency] || STATIC_FX[currency] || 1;
}

async function fetchWithTimeout(url, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

async function createQuote(listing) {
  const FX_API_KEY = 'd51dba3e8a731b12d73e8d72';

  // Try to fetch live rates; fall back to last-known-good values on failure
  let btcUsd = _cachedBtcUsd;
  let fxRates = { ..._cachedFxRates };

  try {
    const [fxRes, btcRes] = await Promise.all([
      fetchWithTimeout('https://open.er-api.com/v6/latest/USD'),
      fetchWithTimeout('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
    ]);
    const [fxData, btcData] = await Promise.all([fxRes.json(), btcRes.json()]);

    if (fxData.result === 'success' && fxData.rates) {
      fxRates = fxData.rates;
      _cachedFxRates = fxRates;
    }
    const parsed = parseFloat(btcData?.data?.amount);
    if (parsed > 0) {
      btcUsd = parsed;
      _cachedBtcUsd = btcUsd;
    }
  } catch (e) {
    console.warn('[quoteService] Live rate fetch failed, using cached/fallback rates:', e.message);
    // If we have no cache either, try the backup FX API
    if (Object.keys(fxRates).length === 0) {
      try {
        const res = await fetchWithTimeout(`https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/USD`);
        const d = await res.json();
        if (d.result === 'success') { fxRates = d.rates; _cachedFxRates = fxRates; }
      } catch {}
    }
    // If listing has a fixed price, use it as btcUsd fallback
    const fixedPrice = parseFloat(listing.bitcoin_price || 0);
    if (fixedPrice > 1000) btcUsd = fixedPrice;
  }

  const currency   = listing.currency || 'USD';
  const usdToLocal = fxRates[currency] || getFxRate(currency);
  const margin     = parseFloat(listing.margin || 0);
  const isUsdtAsset = listing.asset === 'USDT';
  // This function used to assume every listing was BTC-priced: a live-market USDT
  // listing got quoted against the BTC/USD rate (making a $50 USDT trade compute
  // as ~0.0006 USDT), and a 'fixed' listing's bitcoin_price -- already stored in
  // the listing's LOCAL currency (CreateOffer.js labels the field "Fixed Price
  // ({currency} per {asset})" and stores exactly what the seller typed) -- was
  // treated as a USD price and multiplied by usdToLocal a second time. For a
  // listing fixed at 555 XOF/USDT that turned a real ~$16 trade into an
  // executableRate of ~333,000 (555 * 600), so a 10,000 XOF payment settled for
  // 0.03 USDT instead of ~18, and separately the trade's displayed dollar value
  // was computed by multiplying that ~0.03 USDT quantity by the live BTC price
  // (components.btcUsd) -- unrelated to a USDT trade entirely -- producing the
  // ~$2,469 shown for what was really a few cents.
  const assetUsd = isUsdtAsset ? 1 : btcUsd; // USDT is ~1:1 with USD; BTC needs the live rate
  const isFixedPriced = listing.pricing_type === 'fixed' && parseFloat(listing.bitcoin_price || 0) > 0;

  const executableRate = isFixedPriced
    ? parseFloat(listing.bitcoin_price) // already local-currency-denominated; no margin, no FX conversion
    : assetUsd * (1 + margin / 100) * usdToLocal;

  const quoteId = crypto.randomBytes(16).toString('hex');
  quotes.set(quoteId, {
    quoteId,
    listingId: String(listing.id),
    executableRate,
    components: { assetUsd, usdToLocal, margin, currency },
    expiresAt: Date.now() + 30000,
    used: false,
  });

  return { quoteId, executableRate, expiresIn: 30 };
}

function getQuote(quoteId) {
  const q = quotes.get(quoteId);
  if (!q)             throw new Error('Quote not found');
  if (q.used)         { quotes.delete(quoteId); throw new Error('Quote already used'); }
  if (Date.now() > q.expiresAt) {
    quotes.delete(quoteId);
    throw new Error('Quote expired. Please refresh the rate and try again.');
  }
  return q;
}

function consumeQuote(quoteId) {
  const q = getQuote(quoteId);
  quotes.delete(quoteId);
  return q;
}

module.exports = { createQuote, getQuote, consumeQuote };
