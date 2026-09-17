-- 20260908_account_enforcement.sql
-- Support for the BANNED / FROZEN / HOLD account-restriction flows.
--
-- SAFE TO RUN ON A LIVE DB. Every statement is additive or idempotent:
--   * new columns have defaults / are nullable
--   * the case-normalisation only rewrites rows that are not already lower-case
--   * NO strict CHECK constraint is added on account_status — some legacy code
--     paths still write 'ACTIVE'/'BANNED' in upper case and a CHECK would turn
--     that into a hard 500. middleware/requireNotBanned.js and the login /
--     verifyToken gates all compare case-insensitively, and
--     services/accountEnforcement.js writes lower-case going forward, so the
--     data converges without a constraint.
--
-- Nothing in this file moves a balance, an escrow lock, or a withdrawal.

BEGIN;

-- 1. Session invalidation counter. verifyToken embeds the current value as `tv`
--    in every login JWT; accountEnforcement bumps it on freeze/ban/unfreeze/unban
--    so existing tokens for that user stop working immediately.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

-- 2. Restriction metadata (who/when/why). Nullable — cleared when the account
--    is reinstated.
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at   timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason  text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS frozen_at   timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS freeze_reason text;

-- 3. Normalise existing account_status values to lower-case so admin filters and
--    reporting are consistent. The runtime gates already tolerate both cases;
--    this is housekeeping.
UPDATE users
   SET account_status = lower(account_status)
 WHERE account_status IS NOT NULL
   AND account_status <> lower(account_status);

-- 4. Helps the marketplace seller-status filter and the admin user list.
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users (account_status);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- OPTIONAL / NOT REQUIRED BY THE CODE
--
-- The current implementation hides a frozen user's listings via a live
-- seller-status filter and terminates a banned user's listings by setting
-- listings.status = 'BANNED' (falling back to 'inactive' automatically if the
-- DB rejects the value). If you want 'BANNED' to be a first-class listing
-- status and have a CHECK constraint on listings.status, add it to that
-- constraint's allowed set here. Leaving this out changes nothing — the service
-- already degrades gracefully.
--
-- One-off cleanup: terminate listings that are still live for an
-- already-restricted account (accounts restricted BEFORE this migration ran):
--
--   UPDATE listings
--      SET status = 'BANNED', updated_at = now()
--    WHERE status NOT IN ('DELETED','CANCELLED','BANNED')
--      AND seller_id IN (
--        SELECT id FROM users WHERE lower(account_status) = 'banned'
--      );
--
-- (Frozen accounts need no cleanup — the seller-status filter hides their
-- listings for as long as the freeze lasts.)
