// services/securityLogService.js
// PRAQEN — login security events: records every login attempt (success/failure/blocked)
// into security_events (see database/security_events.sql — must be run once in the
// Supabase SQL Editor before this table exists) and enforces a per-account lockout after
// repeated failed passwords. Every read/write here is defensive: if the table doesn't
// exist yet, or the query fails for any reason, login must keep working exactly as before —
// this module only ever ADDS visibility/protection, it must never be why someone can't log in.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Same x-forwarded-for parse already duplicated 3x in server.js — centralized here.
// `app.set('trust proxy', 1)` is already configured (server.js), so this is trustworthy
// for a single reverse-proxy hop.
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}

let warnedMissingTable = false;
function warnOnce(err) {
  if (warnedMissingTable) return;
  if (/relation .*security_events.* does not exist/i.test(err?.message || '')) {
    warnedMissingTable = true;
    console.warn('[securityLogService] security_events table not found — run database/security_events.sql in the Supabase SQL Editor to enable login security logging & lockout.');
  }
}

// Fire-and-forget — never let a logging failure affect the login response.
function logSecurityEvent({ userId = null, email = null, eventType, ip = null, userAgent = null, details = null }) {
  supabaseAdmin.from('security_events').insert({
    user_id: userId,
    email_attempted: email ? String(email).toLowerCase().trim() : null,
    event_type: eventType,
    ip_address: ip,
    user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
    details: details || null,
  }).then(({ error }) => { if (error) warnOnce(error); }, (error) => warnOnce(error));
}

const LOCKOUT_THRESHOLD = 8;       // failed passwords
const LOCKOUT_WINDOW_MS = 30 * 60 * 1000; // within this window...
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // ...locks the account for this long

// Counts LOGIN_FAILED_PASSWORD events for this account since the last LOCKOUT_CLEARED
// marker (or since LOCKOUT_WINDOW_MS ago, whichever is more recent). Locked out once the
// count reaches LOCKOUT_THRESHOLD, until LOCKOUT_DURATION_MS has passed since the most
// recent failure — a steady trickle of guesses keeps the lock extended, a pause lets it
// expire naturally. Deliberately account-scoped, not IP-scoped, so rotating IPs doesn't
// bypass it (distributed brute force is exactly what this needs to catch).
async function isLockedOut(userId) {
  if (!userId) return { locked: false };
  try {
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from('security_events')
      .select('event_type, created_at')
      .eq('user_id', userId)
      .in('event_type', ['LOGIN_FAILED_PASSWORD', 'LOCKOUT_CLEARED'])
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { warnOnce(error); return { locked: false }; }

    const failures = [];
    for (const r of rows || []) {
      if (r.event_type === 'LOCKOUT_CLEARED') break; // a manual clear resets everything before it
      failures.push(r);
    }
    if (failures.length < LOCKOUT_THRESHOLD) return { locked: false };

    const mostRecentFailureMs = new Date(failures[0].created_at).getTime();
    const unlocksAt = mostRecentFailureMs + LOCKOUT_DURATION_MS;
    if (Date.now() >= unlocksAt) return { locked: false };
    return { locked: true, unlocksAt: new Date(unlocksAt).toISOString(), failureCount: failures.length };
  } catch (err) {
    warnOnce(err);
    return { locked: false };
  }
}

module.exports = { getClientIp, logSecurityEvent, isLockedOut, LOCKOUT_THRESHOLD };
