// One-off: apply the email-channel support migration to the live database.
// Fixes: "Could not find the 'channel' column of 'support_tickets' in the schema cache"
// Migration source: database/2026-09-11_email_channel_support.sql (idempotent, additive only)
//
// Requires the `execute_sql` RPC to exist in the Supabase project (Security Definer,
// service-role only). If it doesn't exist, this script prints the exact SQL for the
// team to run in Supabase SQL Editor instead.
//
// Run: node backend/scripts/_ro_apply_email_channel_migration_2026-09-11.js
// Safe to re-run (all statements are IF NOT EXISTS).

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from backend/.env');
  process.exit(1);
}
const supabase = createClient(url, key);

// DDL statements — must stay in sync with database/2026-09-11_email_channel_support.sql
const STATEMENTS = [
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'chat'`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS inbound_email_ref TEXT`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS department TEXT`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority TEXT`,
  `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS trade_reference TEXT`,
  `ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS channel TEXT`,
  `ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS user_email TEXT`,
  `ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS email_message_id TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_support_tickets_inbound_ref ON support_tickets(inbound_email_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_support_tickets_channel ON support_tickets(channel)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_support_messages_email_message_id ON support_messages(email_message_id) WHERE email_message_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_support_messages_channel ON support_messages(channel)`,
  `UPDATE support_tickets SET channel = 'chat' WHERE channel IS NULL`,
  // Force PostgREST to reload its schema cache — without this the REST API keeps
  // serving the old schema and inserts still fail with "schema cache" errors.
  `NOTIFY pgrst, 'reload schema'`,
];

async function runSql(sql) {
  const { data, error } = await supabase.rpc('execute_sql', { query_text: sql, query_params: [] });
  return { data, error };
}

(async () => {
  console.log(`→ Target: ${url.replace(/\/\/[^.]+\./, '//***.')}`);

  // Probe execute_sql availability
  const probe = await runSql('SELECT 1 AS ok');
  if (probe.error) {
    console.error('✗ execute_sql RPC not available:', probe.error.message);
    console.error('\n=== Run this file manually in Supabase SQL Editor ===');
    console.error(require('path').resolve(__dirname, '../../database/2026-09-11_email_channel_support.sql'));
    process.exitCode = 2; return; // let in-flight fetches settle (avoids libuv assertion on Windows)
  }
  console.log('✓ execute_sql RPC available');

  let failed = 0;
  for (const sql of STATEMENTS) {
    const label = sql.replace(/\s+/g, ' ').slice(0, 72);
    const { error } = await runSql(sql);
    if (error) {
      failed++;
      console.error(`✗ ${label}\n   → ${error.message}`);
    } else {
      console.log(`✓ ${label}`);
    }
  }

  // Verify: PostgREST-level check (this is what the failing endpoint actually uses)
  console.log('\n→ Verifying via PostgREST (the layer that reported the bug)…');
  const [{ error: tErr }, { error: mErr }] = await Promise.all([
    supabase.from('support_tickets').select('channel, inbound_email_ref, department, priority, trade_reference').limit(1),
    supabase.from('support_messages').select('channel, user_email, email_message_id').limit(1),
  ]);

  if (!tErr && !mErr) {
    console.log('✓ support_tickets: channel, inbound_email_ref, department, priority, trade_reference visible');
    console.log('✓ support_messages: channel, user_email, email_message_id visible');
    console.log('\n✅ Migration applied and verified. Ticket-creation flow is unblocked.');
  } else {
    failed++;
    console.error('✗ PostgREST still cannot see the columns:');
    if (tErr) console.error('   support_tickets →', tErr.message);
    if (mErr) console.error('   support_messages →', mErr.message);
    console.error('   (Schema cache may need a moment, or run the NOTIFY again / restart PostgREST.)');
  }

  process.exitCode = failed ? 1 : 0; // let the event loop drain naturally
})().catch(e => { console.error('✗ Unexpected:', e.message); process.exit(1); });
