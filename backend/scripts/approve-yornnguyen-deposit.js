// Mirrors POST /api/admin/seller-deposits/:userId/approve-deposit exactly.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

(async () => {
  const targetUserId = '695d7e05-999f-4264-9952-5ae6730de32a'; // yornnguyen
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await db.from('seller_deposits')
    .update({ status: 'LOCKED', approved_at: nowIso, updated_at: nowIso })
    .eq('user_id', targetUserId).eq('status', 'PENDING_APPROVAL')
    .select().single();

  if (error || !rows) { console.error('No pending deposit approval for this user:', error?.message); return; }
  console.log('Approved:', rows);

  await db.from('admin_audit_log').insert({
    admin_id: '14762cd0-d3b2-474f-acab-fe0071961e9a', // CEO account
    action: 'SELLER_DEPOSIT_APPROVED',
    target_id: targetUserId,
    details: { amount: rows.amount_usdt },
    created_at: nowIso,
  }).then(null, e => console.warn('audit log warning:', e.message));

  await db.from('notifications').insert({
    user_id: targetUserId, type: 'wallet', title: '✅ Security Deposit Approved',
    message: `Your $${rows.amount_usdt} USDT security deposit has been approved. You can now create gift card offers.`,
    action: '/create-offer?type=gc_sell', is_read: false, created_at: nowIso,
  });
  console.log('Notification sent.');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e); process.exit(1); });
