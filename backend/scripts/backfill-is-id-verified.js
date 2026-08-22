// One-time data backfill: kyc_status='approved' unambiguously means an admin
// reviewed and approved a user's documents via PUT /api/admin/kyc/:userId/approve,
// which always sets is_id_verified=true in the same atomic update -- there is no
// code path that sets kyc_status='approved' any other way. 1,029 of 1,314
// "approved" users are missing is_id_verified=true anyway (likely from data
// predating this endpoint, or direct DB edits), silently blocking them from every
// feature gated on is_id_verified despite showing as verified in the admin panel.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const { count: before } = await db.from('users').select('*', { count: 'exact', head: true }).eq('kyc_status', 'approved').eq('is_id_verified', false);
  console.log('Affected before:', before);

  const { data, error } = await db.from('users')
    .update({ is_id_verified: true, updated_at: new Date().toISOString() })
    .eq('kyc_status', 'approved').eq('is_id_verified', false)
    .select('id');

  if (error) { console.error('FAILED:', error.message); return; }
  console.log('Updated:', data.length, 'users');

  const { count: after } = await db.from('users').select('*', { count: 'exact', head: true }).eq('kyc_status', 'approved').eq('is_id_verified', false);
  console.log('Affected after:', after);
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
