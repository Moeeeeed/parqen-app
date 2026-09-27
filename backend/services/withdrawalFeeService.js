// ── Tiered external withdrawal fee, by USD value of the withdrawal ─────────
// Shared by both BTC (routes/hdWalletRoutes.js) and USDT (server.js) external
// send flows so the two currencies never drift apart.
//
// Small withdrawals are charged hardest on purpose: a user who buys and
// immediately cashes out elsewhere currently costs PRAQEN almost nothing to
// let go, which does nothing to discourage using PRAQEN as a free on-ramp to
// a competitor. Large withdrawals ($2,000+) stay at the original flat rate —
// those are the platform's most valuable, most price-aware users, and the
// ones most likely to leave over a bad rate if it stands out next to a
// competitor's.
//
// Added 2026-09-27 — replaces the old flat 2.2% (BTC) / 1.8% (USDT) rates.
const TIERS = [
  { max: 50, type: 'flat', value: 4.5, label: '$4.50 fee' },
  { max: 100, type: 'pct', value: 0.09, label: '9% fee' },
  { max: 500, type: 'flat', value: 18, label: '$18 fee' },
  { max: 2000, type: 'pct', value: 0.044, label: '4.4% fee' },
  { max: Infinity, type: 'pct', value: 0.022, label: '2.2% fee' },
];

// amountUsd: the USD-equivalent value of the withdrawal (USDT is treated 1:1).
// Returns { feeUsd, label }.
function calcWithdrawalFeeUsd(amountUsd) {
  const amt = Math.max(0, Number(amountUsd) || 0);
  const tier = TIERS.find((t) => amt < t.max);
  const feeUsd = tier.type === 'flat' ? tier.value : amt * tier.value;
  return { feeUsd: parseFloat(feeUsd.toFixed(2)), label: tier.label };
}

module.exports = { calcWithdrawalFeeUsd };
