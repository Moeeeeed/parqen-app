-- ─────────────────────────────────────────────────────────────────────────────
-- Account Settings: NoOnes-parity support columns
-- 1. has_changed_username (BOOLEAN, DEFAULT FALSE) — persisted per-user flag for
--    the one-time username lock. Set to TRUE in the SAME update as the username
--    change itself (see PUT /api/users/profile). The update-username path checks
--    this flag server-side and rejects a second change with 403. A backfill from
--    username_changed_at is included so existing users who already changed their
--    username stay locked.
-- 2. withdrawal_locked_until (TIMESTAMPTZ, NULL) — set to now + 24h when a user
--    confirms an email or phone number change. Wallet withdrawals (BTC & USDT
--    external sends) are blocked while this timestamp is in the future. The app
--    always takes the max(existing lock, now+24h), so consecutive changes never
--    stack locks.
-- Run once in Supabase (SQL Editor) or via `node run-sql.js`.
-- ─────────────────────────────────────────────────────────────────────────────

-- One-time username lock flag
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_changed_username BOOLEAN NOT NULL DEFAULT FALSE;

-- Timestamp of the first username change (used as fallback + audit)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

-- Withdrawal lock column (NULL = not locked)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS withdrawal_locked_until TIMESTAMPTZ;

-- Backfill: anyone who already changed their username once is locked too
UPDATE users
SET has_changed_username = TRUE
WHERE username_changed_at IS NOT NULL
  AND has_changed_username = FALSE;
