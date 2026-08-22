// Pause every ACTIVE SELL/SELL_BITCOIN listing whose margin falls outside the
// newly-tightened -10%/+1% range, and notify each affected seller once (not
// once per listing) so they know to update their rate and can reactivate.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const { data: listings } = await db.from('listings')
    .select('id,seller_id,listing_type,asset,status,margin,currency')
    .eq('status', 'ACTIVE').in('listing_type', ['SELL', 'SELL_BITCOIN']);

  const bad = listings.filter(l => {
    const m = parseFloat(l.margin);
    return isNaN(m) || m < -10 || m > 1;
  });

  if (bad.length === 0) { console.log('Nothing out of range.'); return; }

  const ids = bad.map(l => l.id);
  const { error: pauseErr } = await db.from('listings')
    .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
    .in('id', ids);
  if (pauseErr) { console.error('PAUSE FAILED:', pauseErr.message); return; }
  console.log(`Paused ${bad.length} listing(s).`);

  // Group by seller so each person gets ONE notification, not one per listing.
  const bySeller = {};
  bad.forEach(l => {
    if (!bySeller[l.seller_id]) bySeller[l.seller_id] = [];
    bySeller[l.seller_id].push(l);
  });

  const sellerIds = Object.keys(bySeller);
  const { data: users } = await db.from('users').select('id,username').in('id', sellerIds);
  const nameMap = Object.fromEntries((users || []).map(u => [u.id, u.username]));

  for (const [sellerId, sellerListings] of Object.entries(bySeller)) {
    const count = sellerListings.length;
    const marginList = sellerListings.map(l => `${l.asset} (${l.currency}): ${l.margin > 0 ? '+' : ''}${l.margin}%`).join(', ');
    const message = count === 1
      ? `Your Sell offer's margin (${sellerListings[0].margin > 0 ? '+' : ''}${sellerListings[0].margin}%) is outside the new allowed range for Sell offers: -10% to +1%. It's been paused. Update your margin and reactivate it from your Dashboard whenever you're ready.`
      : `${count} of your Sell offers had margins outside the new allowed range for Sell offers (-10% to +1%): ${marginList}. They've been paused. Update your margins and reactivate them from your Dashboard whenever you're ready.`;

    await db.from('notifications').insert({
      user_id: sellerId, type: 'listing', title: '⏸️ Sell Offer(s) Paused — Margin Out of Range',
      message, action: '/my-listings', is_read: false, created_at: new Date().toISOString(),
    });
    console.log(`  Notified ${nameMap[sellerId] || sellerId.slice(0,8)} — ${count} listing(s): ${marginList}`);
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
