// One-off correction: the manually pinned Gift Card "Active Trader of the Week"
// row (trader_of_week.category = 'gift_card', pinned = true) still points at
// ukbuyer2022's Aug 18 listing, which has since been deleted. Because pinned
// rows are skipped by traderOfWeekService's weekly auto-rotation, this never
// self-healed — the frontend's dead-listing fallback (GiftCardMarketplace.js)
// quietly demoted the badge to a generic ranking instead of showing nothing.
// This repoints the pin at ukbuyer2022's current ACTIVE listing so their
// intended "Active Trader of the Week" pin shows again.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const UKBUYER_ID = '19563f83-e4dd-468e-8bfe-47220cc23bb0';
const NEW_ACTIVE_LISTING_ID = 'a078de2e-6c80-421d-b7d1-952217cb1305'; // BUY_GIFT_CARD, GB, status ACTIVE

async function run() {
  const { data: listing, error: lErr } = await supabase
    .from('listings')
    .select('id, seller_id, status')
    .eq('id', NEW_ACTIVE_LISTING_ID)
    .single();
  if (lErr || !listing || listing.seller_id !== UKBUYER_ID || listing.status !== 'ACTIVE') {
    throw new Error('Replacement listing check failed: ' + JSON.stringify({ lErr, listing }));
  }

  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, username, total_trades')
    .eq('id', UKBUYER_ID)
    .single();
  if (uErr || !user) throw new Error('ukbuyer2022 lookup failed: ' + (uErr && uErr.message));

  const { data, error } = await supabase
    .from('trader_of_week')
    .update({ listing_id: NEW_ACTIVE_LISTING_ID, total_trades: user.total_trades || 0 })
    .eq('category', 'gift_card')
    .eq('user_id', UKBUYER_ID) // safety: only touch the row if it's still actually ukbuyer2022's pin
    .select();
  if (error) throw new Error('update failed: ' + error.message);
  if (!data || data.length === 0) throw new Error('No row updated — gift_card pin may no longer belong to ukbuyer2022, aborting.');

  console.log('Gift Card pin repointed to ukbuyer2022\'s current active listing:');
  console.log(JSON.stringify(data, null, 2));
}

run().catch(err => { console.error(err); process.exit(1); });
