// One-off: the pinned gift_card trader_of_week row had user_id/username set to
// ukbuyer2022 but listing_id still pointing at a DELETED listing owned by a
// different seller entirely (KEN IGHO) — so GiftCardMarketplace.js's own
// "is this winner's listing still live?" check always failed and the badge
// silently fell back to someone else. Repoints listing_id at ukbuyer2022's own
// active BUY_GIFT_CARD (Amazon, GBP, £10 min) listing so it actually resolves.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const UKBUYER_ID = '19563f83-e4dd-468e-8bfe-47220cc23bb0';
const UKBUYER_LISTING_ID = 'b4190b5c-1015-40f0-9758-22239ea48d09'; // active BUY_GIFT_CARD, Amazon, GBP, £10 min

async function run() {
  const { data: user, error: uErr } = await supabase
    .from('users').select('id, username, total_trades, average_rating')
    .eq('id', UKBUYER_ID).single();
  if (uErr || !user) throw new Error('ukbuyer2022 lookup failed: ' + (uErr && uErr.message));

  const { data: listing, error: lErr } = await supabase
    .from('listings').select('id, seller_id, status')
    .eq('id', UKBUYER_LISTING_ID).single();
  if (lErr || !listing || listing.seller_id !== UKBUYER_ID || listing.status !== 'ACTIVE') {
    throw new Error('listing check failed: ' + JSON.stringify({ lErr, listing }));
  }

  const { data: row, error: upErr } = await supabase
    .from('trader_of_week')
    .update({
      user_id: user.id,
      username: user.username,
      listing_id: listing.id,
      total_trades: user.total_trades || 0,
      average_rating: parseFloat(user.average_rating || 0),
      selected_at: new Date().toISOString(),
    })
    .eq('category', 'gift_card')
    .select().single();
  if (upErr) throw new Error('update failed: ' + upErr.message);

  console.log('gift_card trader_of_week row fixed:');
  console.log(JSON.stringify(row, null, 2));
}

run().catch(err => { console.error(err); process.exit(1); });
