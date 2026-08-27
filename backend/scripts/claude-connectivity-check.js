// READ-ONLY: confirm Supabase connectivity works with whatever key is
// currently in .env (post-rotation check). One count query, nothing else.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
(async () => {
  const { count, error } = await supa.from('users').select('id', { count: 'exact', head: true });
  if (error) { console.log('CONNECTIVITY FAILED:', error.message); process.exit(1); }
  console.log('CONNECTIVITY OK — users table reachable, count:', count);
})();
