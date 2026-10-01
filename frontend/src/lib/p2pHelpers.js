/**
 * Shared P2P Helper Utilities for Offer Cards and Active Trade Cards
 */

// Sanitizes raw payment method inputs and strips unwanted listing type prefixes/suffixes (e.g. "sell_bitcoin")
export function cleanPaymentMethod(pm, defaultVal = 'Payment') {
  if (!pm) return defaultVal;
  let str = String(pm).trim();

  // Strip prefixes/suffixes like "sell_", "buy_", "sell", "buy"
  str = str.replace(/^(sell_|buy_|sell\s+|buy\s+)/i, '');
  str = str.replace(/(_sell|_buy|\s+sell|\s+buy)$/i, '');

  if (/^sell$/i.test(str) || /^buy$/i.test(str)) {
    str = '';
  }

  if (!str) return defaultVal;

  const lower = str.toLowerCase().replace(/[\s-]/g, '_');

  const MAP = {
    mtn_momo: 'MTN Mobile Money',
    mtmmomo: 'MTN Mobile Money',
    mtn_mobile_money: 'MTN Mobile Money',
    mtn: 'MTN Mobile Money',
    vodafone: 'Vodafone Cash',
    vodafone_cash: 'Vodafone Cash',
    vodafonecash: 'Vodafone Cash',
    airteltigo: 'AirtelTigo Money',
    airteltigo_money: 'AirtelTigo Money',
    mpesa: 'M-Pesa',
    'm-pesa': 'M-Pesa',
    m_pesa: 'M-Pesa',
    bank_transfer: 'Bank Transfer',
    banktransfer: 'Bank Transfer',
    chipper: 'Chipper Cash',
    chipper_cash: 'Chipper Cash',
    opay: 'OPay',
    palmpay: 'PalmPay',
    kuda: 'Kuda Bank',
    wave: 'Wave',
    orange_money: 'Orange Money',
    orangemoney: 'Orange Money',
    telecel: 'Telecel Cash',
    bitcoin: 'Bitcoin',
    btc: 'Bitcoin',
    usdt: 'USDT',
  };

  if (MAP[lower]) return MAP[lower];
  if (lower.includes('mtn') || lower.includes('momo')) return 'MTN Mobile Money';
  if (lower.includes('vodafone')) return 'Vodafone Cash';
  if (lower.includes('airtel')) return 'AirtelTigo Money';
  if (lower.includes('mpesa') || lower.includes('m-pesa')) return 'M-Pesa';
  if (lower.includes('bank')) return 'Bank Transfer';
  if (lower.includes('btc') || lower.includes('bitcoin')) return 'Bitcoin';

  return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Checks if a listing's payment method matches a selected filter value,
 * accounting for all alias variations (e.g. MTN MoMo vs MTN Mobile Money).
 */
export function isPaymentMethodMatch(listingPm, selectedFilterValue) {
  if (!selectedFilterValue || selectedFilterValue === 'all' || selectedFilterValue === 'ALL') return true;
  if (!listingPm) return false;

  const selLower = String(selectedFilterValue).toLowerCase();
  const listingLower = String(listingPm).toLowerCase();

  const selClean = cleanPaymentMethod(selectedFilterValue).toLowerCase();
  const listingClean = cleanPaymentMethod(listingPm).toLowerCase();

  // Direct match or cleaned label match
  if (selClean === listingClean || selLower === listingLower) return true;

  // Normalized alphanumeric match (ignores spaces, underscores, hyphens)
  const normSel = selLower.replace(/[^a-z0-9]/g, '');
  const normListing = listingLower.replace(/[^a-z0-9]/g, '');

  if (normSel === normListing) return true;

  // Specific check for MTN Mobile Money / MTN MoMo / momo / mtn
  const isMtnSel = normSel.includes('mtn') || normSel.includes('momo');
  const isMtnListing = normListing.includes('mtn') || normListing.includes('momo');
  if (isMtnSel && isMtnListing) return true;

  // Specific check for Vodafone / Telecel
  const isVodaSel = normSel.includes('voda') || normSel.includes('telecel');
  const isVodaListing = normListing.includes('voda') || normListing.includes('telecel');
  if (isVodaSel && isVodaListing) return true;

  // Specific check for Airtel / AirtelTigo
  const isAirtelSel = normSel.includes('airtel') || normSel.includes('tigo');
  const isAirtelListing = normListing.includes('airtel') || normListing.includes('tigo');
  if (isAirtelSel && isAirtelListing) return true;

  // Specific check for Bank
  const isBankSel = normSel.includes('bank') || normSel.includes('wire');
  const isBankListing = normListing.includes('bank') || normListing.includes('wire');
  if (isBankSel && isBankListing) return true;

  return normListing.includes(normSel) || normSel.includes(normListing);
}

/**
 * Calculates Pay / Receive trade amounts based on margin & rates
 */
export function calculateReceiveAmount({ payAmount, margin = 0, rate = 89000, usdRate = 1 }) {
  const pay = parseFloat(payAmount || 0);
  const m = parseFloat(margin || 0);
  const r = parseFloat(rate || 89000);
  const u = parseFloat(usdRate || 1);

  const receiveFiat = m !== 0 ? pay / (1 + m / 100) : pay;
  const sellerRateLocal = r * (1 + m / 100) * u;
  const btcReceived = sellerRateLocal > 0 ? pay / sellerRateLocal : 0;

  return {
    payAmount: pay,
    receiveFiat: parseFloat(receiveFiat.toFixed(2)),
    sellerRateLocal,
    btcReceived,
  };
}

export function calcP2PAmounts(fiatAmt, marginPct = 0, btcUSD = 89000, usdRate = 1) {
  return calculateReceiveAmount({ payAmount: fiatAmt, margin: marginPct, rate: btcUSD, usdRate });
}

/**
 * Currency formatter matching Offer Card output
 */
export function fmtCurrency(val, currencyCode = 'USD', decimals = 2) {
  const n = parseFloat(val || 0);
  if (isNaN(n)) return `0.00 ${currencyCode}`;
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted} ${currencyCode.toUpperCase()}`;
}
