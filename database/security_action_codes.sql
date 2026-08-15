-- security_action_codes — persistent store for short-lived 2FA action codes
-- (release BTC, send BTC, send USDT, enable 2FA). Replaces the old in-memory
-- Map in services/actionCodeService.js, which lost every pending code on any
-- server restart/redeploy between "code sent" and "code submitted" — users
-- would request a code, then get "No security code found" seconds later for
-- no reason visible to them.
CREATE TABLE IF NOT EXISTS security_action_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  action      TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, action)
);

CREATE INDEX IF NOT EXISTS idx_security_action_codes_expires ON security_action_codes(expires_at);
