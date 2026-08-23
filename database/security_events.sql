-- PRAQEN — security_events table
-- Records every login attempt (success, wrong password, wrong OTP/2FA code, blocked-banned,
-- blocked-lockout) so the CEO dashboard can show real fraud/brute-force alerts, and so
-- repeated failures against one account can trigger an actual login lockout.
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS security_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  email_attempted VARCHAR(255),
  event_type      VARCHAR(50) NOT NULL, -- LOGIN_SUCCESS | LOGIN_FAILED_PASSWORD | LOGIN_FAILED_OTP |
                                         -- LOGIN_FAILED_2FA | LOGIN_2FA_REQUIRED | LOGIN_BLOCKED_BANNED |
                                         -- LOGIN_BLOCKED_LOCKOUT | LOCKOUT_CLEARED
  ip_address      VARCHAR(64),
  user_agent      TEXT,
  details         JSONB,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_security_events_user_id    ON security_events(user_id);
CREATE INDEX idx_security_events_type_time  ON security_events(event_type, created_at DESC);
CREATE INDEX idx_security_events_ip_time    ON security_events(ip_address, created_at DESC);

-- Lock this down entirely — only the backend's service role (which bypasses RLS) should
-- ever read or write this table, same reasoning as admin_audit_log.sql.
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
