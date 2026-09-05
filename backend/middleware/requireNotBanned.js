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

// 2026-09-05: 'FROZEN' is a real account_status value set from the admin panel (distinct
// from 'banned') that was never actually checked anywhere in the backend — every gate here
// only ever looked for the literal string 'banned', so a frozen account could still log in,
// open trades, swap, and submit/have-approved withdrawals exactly like an unrestricted
// account. The only thing actually stopping a frozen account from moving funds was whatever
// wallet-level hold (locked_balance_btc) happened to already be in place — nothing tied to
// the status itself. Blocking both values here closes it everywhere this function is used
// (trade creation, swap, withdrawal requests, and the CEO approve-route's re-check).
const BLOCKED_STATUSES = ['banned', 'FROZEN'];

async function isUserBanned(userId) {
  const { data, error } = await supabaseAdmin
    .from('users').select('account_status').eq('id', userId).maybeSingle();
  if (error) throw new Error(`isUserBanned: lookup failed — ${error.message}`);
  return BLOCKED_STATUSES.includes(data?.account_status);
}

async function requireNotBanned(req, res, next) {
  try {
    if (await isUserBanned(req.userId)) {
      return res.status(403).json({
        error: 'ACCOUNT_BANNED',
        message: 'Your account is banned or frozen. Trading, offers, and wallet transfers are disabled.',
      });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: 'Could not verify account status' });
  }
}

module.exports = { requireNotBanned, isUserBanned };
