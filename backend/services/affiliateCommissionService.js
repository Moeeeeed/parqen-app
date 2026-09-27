// services/affiliateCommissionService.js — records REAL commission earned by
// affiliates under the NEW level-based program (Explorer/Builder/Titan/Legendary).
// Completely separate from the OLD affiliate_earnings/commission_btc engine —
// that system is untouched.
//
// Inert until REFERRAL_PAYOUTS_ENABLED=true (affiliateSummaryService.cashEnabled()).
// Called fire-and-forget, right after a trade's platform fee is confirmed
// COLLECTED (tradeEscrowService.js's release flow) — never throws, never blocks
// or affects the trade itself. Mirrors affiliateSummaryService's own
// trade-qualifying rules exactly (BTC/USDT only, not gift card, not test) so the
// ledger only ever contains money that also counts toward that affiliate's real
// volume numbers — no other way for a trade to generate commission here.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const affiliateSummaryService = require('./affiliateSummaryService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// One trade -> at most one commission row per distinct referrer involved (the
// buyer's referrer and/or the seller's referrer, if they're different people).
// Self-dealing (a referrer who is themselves the buyer or seller) never counts —
// same guard aggregate() already uses for volume.
async function recordForTrade(tradeData) {
  if (!affiliateSummaryService.cashEnabled()) return; // inert until the switch is on
  try {
    if (!tradeData) return;
    const { id: tradeId, buyer_id: buyerId, seller_id: sellerId, currency, amount_usd, gift_card_brand: giftCardBrand, is_test: isTest, fee_status: feeStatus, listing_id: listingId } = tradeData;

    if (!['BTC', 'USDT'].includes(String(currency || '').toUpperCase())) return;
    if (isTest) return;
    if (feeStatus !== 'COLLECTED') return;
    if (giftCardBrand) return;
    const usd = Number(amount_usd);
    if (!(usd > 0)) return;

    let listingType = '';
    if (listingId) {
      const { data: listing } = await supabaseAdmin.from('listings').select('listing_type').eq('id', listingId).maybeSingle();
      listingType = String(listing?.listing_type || '').toUpperCase();
      if (listingType.includes('GIFT_CARD')) return;
    }

    const participantIds = [buyerId, sellerId].filter(Boolean);
    if (participantIds.length === 0) return;
    const { data: participants } = await supabaseAdmin.from('users').select('id, referred_by').in('id', participantIds);

    // referrerId -> the (first) referred participant, for record-keeping. A Map
    // dedupes the rare case where one referrer brought both sides of the trade —
    // one commission row per referrer per trade, matching aggregate()'s own
    // once-per-trade-per-affiliate volume counting.
    const referrers = new Map();
    (participants || []).forEach((p) => {
      const referrerId = p.referred_by;
      if (!referrerId) return;
      if (referrerId === buyerId || referrerId === sellerId) return; // no self-dealing
      if (!referrers.has(referrerId)) referrers.set(referrerId, p.id);
    });
    if (referrers.size === 0) return;

    // tradeEscrowService is the single source of truth for the platform fee rate
    // (see affiliateSummaryService's LEVELS comment) — never a second hardcoded copy.
    // Gift-card trades already excluded above; listingType picks between the
    // Buy Bitcoin page rate (SELL listings, 2%) and the Sell Bitcoin page rate
    // (BUY listings, 3%) so the commission always matches what was really charged.
    const feeRate = require('./tradeEscrowService').feeRateFor(listingType);
    const platformFeeUsd = Number((usd * feeRate).toFixed(2));
    if (platformFeeUsd <= 0) return;

    for (const [affiliateId, referredUserId] of referrers) {
      try {
        const summary = await affiliateSummaryService.getAffiliateSummary(supabaseAdmin, affiliateId, { cashEnabled: true });
        if (!summary.level) continue; // no level yet (or capped at "getting started") — nothing earned
        const commissionUsd = Number((platformFeeUsd * summary.level.rate).toFixed(2));
        if (commissionUsd <= 0) continue;

        const { error } = await supabaseAdmin.from('affiliate_commission_ledger').insert({
          affiliate_id: affiliateId,
          referred_user_id: referredUserId,
          trade_id: tradeId,
          level_index: summary.level.index,
          level_name: summary.level.name,
          rate: summary.level.rate,
          currency: String(currency).toUpperCase(),
          platform_fee_usd: platformFeeUsd,
          commission_usd: commissionUsd,
        });
        if (error && error.code !== '23505') { // 23505 = already recorded for this trade — expected on any retry
          console.error(`[affiliateCommission] insert failed for affiliate ${String(affiliateId).slice(0, 8)}, trade ${String(tradeId).slice(0, 8)}:`, error.message);
        }
      } catch (perAffiliateErr) {
        console.error(`[affiliateCommission] failed for affiliate ${String(affiliateId).slice(0, 8)}:`, perAffiliateErr.message);
      }
    }
  } catch (e) {
    console.error('[affiliateCommission] recordForTrade failed (non-fatal, trade unaffected):', e.message);
  }
}

module.exports = { recordForTrade };
