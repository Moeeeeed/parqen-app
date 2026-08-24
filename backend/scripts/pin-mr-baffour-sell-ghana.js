// One-off: move the Sell-page "special offer" badge for Ghana from KEN IGHO to
// MR_BAFFOUR, per explicit request. Writes both the legacy flat 'sell_bitcoin'
// category key (read by whatever backend build is currently deployed) and the
// new per-country 'sell_bitcoin:GH' key (read once services/traderOfWeekService.js's
// per-country rewrite is deployed), so the swap takes effect immediately either way.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const MR_BAFFOUR_ID = '15b5454e-3357-4ada-a8f6-c6470a344cb3';
const MR_BAFFOUR_LISTING_ID = 'ca4470e7-1722-46f5-8360-20cfb593a789'; // active GH BUY BTC listing, pays via mtn_momo

async function run() {
  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('id, username, total_trades, average_rating')
    .eq('id', MR_BAFFOUR_ID)
    .single();
  if (uErr || !user) throw new Error('MR_BAFFOUR lookup failed: ' + (uErr && uErr.message));

  const { data: listing, error: lErr } = await supabase
    .from('listings')
    .select('id, seller_id, status, country, payment_method')
    .eq('id', MR_BAFFOUR_LISTING_ID)
    .single();
  if (lErr || !listing || listing.seller_id !== MR_BAFFOUR_ID || listing.status !== 'ACTIVE') {
    throw new Error('MR_BAFFOUR listing check failed: ' + JSON.stringify({ lErr, listing }));
  }

  const nowIso = new Date().toISOString();
  const nextRotation = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const base = {
    user_id: user.id,
    username: user.username,
    listing_id: listing.id,
    total_trades: user.total_trades || 0,
    average_rating: parseFloat(user.average_rating || 0),
    selected_at: nowIso,
    next_rotation_at: nextRotation,
  };

  const rows = [
    { category: 'sell_bitcoin', ...base, country: null, payment_method: null },
    { category: 'sell_bitcoin:GH', ...base, country: 'GH', payment_method: 'mtn' },
  ];

  const { error: upErr } = await supabase.from('trader_of_week').upsert(rows, { onConflict: 'category' });
  if (upErr) throw new Error('upsert failed: ' + upErr.message);

  console.log('Sell-page Ghana special offer moved to MR_BAFFOUR:');
  console.log(JSON.stringify(rows, null, 2));
}

run().catch(err => { console.error(err); process.exit(1); });
