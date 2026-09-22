-- 2026-09-22_security_tab_noones_parity.sql
-- Security tab (Settings → Security) NoOnes-parity feature.
--
-- 1) two_fa_events — per-event 2FA requirement toggles ("2FA event settings"
--    bottom sheet): log in / sending cryptocurrency / releasing cryptocurrency.
--    Stored as JSONB so new event types can be added later without migrations.
--
-- 2) The single-active-method model is ALREADY guaranteed by the existing
--    columns (see database/add_2fa_columns.sql + database/run_migrations.sql):
--      users.two_factor_enabled BOOLEAN
--      users.two_factor_method  TEXT  -- 'email' | 'sms' | 'whatsapp' | 'totp' | NULL
--    Disabling sets method to NULL; enabling sets exactly one method.
--    The PATCH /api/users/security + TOTP endpoints enforce the invariant in
--    code (backend/server.js, ACTION_REQUIRED_LABELS block).

ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_events JSONB DEFAULT '{"login": true, "sending_crypto": true, "releasing_crypto": true}';

COMMENT ON COLUMN users.two_fa_events IS
  'Per-event 2FA requirement toggles (Settings > Security). Keys: login, sending_crypto, releasing_crypto. Missing keys default to true.';

-- Backfill: ensure every existing user has the default event set
UPDATE users
SET two_fa_events = '{"login": true, "sending_crypto": true, "releasing_crypto": true}'
WHERE two_fa_events IS NULL;
