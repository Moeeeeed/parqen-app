// SELL cap reverted from -10%/+1% back to -10%/+10%. Reactivate the listings
// I paused for the earlier tighter rule that are now back in range, and
// notify their sellers. Leave genuinely out-of-range ones (>10% or <-10%)
// paused, but correct their earlier notification's stated range.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const { data: paused } = await db.from('listings')
    .select('id,seller_id,listing_type,asset,status,margin,currency')
    .eq('status', 'PAUSED').in('listing_type', ['SELL', 'SELL_BITCOIN'])
    .gte('updated_at', '2026-08-22T00:00:00Z'); // only today's batch, not older manual pauses

  const backInRange = paused.filter(l => { const m = parseFloat(l.margin); return !isNaN(m) && m >= -10 && m <= 10; });
  const stillOut = paused.filter(l => { const m = parseFloat(l.margin); return isNaN(m) || m < -10 || m > 10; });

  console.log(`Back in range (reactivating): ${backInRange.length}`);
  console.log(`Still out of range (staying paused): ${stillOut.length}`);

  if (backInRange.length > 0) {
    const { error } = await db.from('listings')
      .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
      .in('id', backInRange.map(l => l.id));
    if (error) { console.error('REACTIVATE FAILED:', error.message); return; }
  }

  const { data: users } = await db.from('users').select('id,username').in('id', [...new Set(paused.map(l => l.seller_id))]);
  const nameMap = Object.fromEntries((users || []).map(u => [u.id, u.username]));

  const bySellerBack = {};
  backInRange.forEach(l => { (bySellerBack[l.seller_id] ||= []).push(l); });
  for (const [sellerId, listings] of Object.entries(bySellerBack)) {
    const list = listings.map(l => `${l.asset} (${l.currency}): ${l.margin > 0 ? '+' : ''}${l.margin}%`).join(', ');
    await db.from('notifications').insert({
      user_id: sellerId, type: 'listing', title: '✅ Sell Offer(s) Reactivated',
      message: `The Sell margin range was corrected back to -10% to +10%. ${listings.length > 1 ? `Your ${listings.length} offers (${list}) are` : `Your offer (${list}) is`} back live on the marketplace.`,
      action: '/my-listings', is_read: false, created_at: new Date().toISOString(),
    });
    console.log(`  Reactivated ${nameMap[sellerId] || sellerId.slice(0,8)} — ${list}`);
  }

  const bySellerStillOut = {};
  stillOut.forEach(l => { (bySellerStillOut[l.seller_id] ||= []).push(l); });
  for (const [sellerId, listings] of Object.entries(bySellerStillOut)) {
    const list = listings.map(l => `${l.asset} (${l.currency}): ${l.margin > 0 ? '+' : ''}${l.margin}%`).join(', ');
    await db.from('notifications').insert({
      user_id: sellerId, type: 'listing', title: '⏸️ Sell Offer(s) Still Paused — Margin Out of Range',
      message: `Correction: the allowed range for Sell offers is -10% to +10% (not -10% to +1% as an earlier message said). ${listings.length > 1 ? `Your ${listings.length} offers (${list}) are` : `Your offer (${list}) is`} still outside that range and remain paused. Update the margin and reactivate from your Dashboard.`,
      action: '/my-listings', is_read: false, created_at: new Date().toISOString(),
    });
    console.log(`  Still paused, corrected notice sent to ${nameMap[sellerId] || sellerId.slice(0,8)} — ${list}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
