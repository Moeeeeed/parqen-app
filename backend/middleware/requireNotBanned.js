// middleware/requireNotBanned.js
// PRAQEN — single source of truth for blocking banned accounts from moving funds.
//
// Always re-reads account_status directly from the users table on every call —
// never trusts a frontend-supplied value, a JWT claim, or a cached flag. A user
// banned mid-session must be blocked on their very next request, not just their
// next login.
//
// Use requireNotBanned as Express middleware (after verifyToken) on any route
// that creates or progresses an external transfer for the AUTHENTICATED caller.
// Use isUserBanned directly wherever the account being checked isn't req.userId —
// e.g. a CEO/admin approving someone else's pending withdrawal, where the
// withdrawal owner's status matters, not the approver's.

'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function isUserBanned(userId) {
  const { data, error } = await supabaseAdmin
    .from('users').select('account_status').eq('id', userId).maybeSingle();
  if (error) throw new Error(`isUserBanned: lookup failed — ${error.message}`);
  return data?.account_status === 'banned';
}

async function requireNotBanned(req, res, next) {
  try {
    if (await isUserBanned(req.userId)) {
      return res.status(403).json({
        error: 'ACCOUNT_BANNED',
        message: 'Your account is banned and wallet withdrawals are disabled.',
      });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: 'Could not verify account status' });
  }
}

module.exports = { requireNotBanned, isUserBanned };
