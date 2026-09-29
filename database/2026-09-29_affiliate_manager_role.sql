-- ─────────────────────────────────────────────────────────────────────────────
-- Affiliate Manager role — grants access to the standalone Affiliate Program
-- Manager Portal (its own login, separate from CEO/Admin Dashboard access).
--
-- Purely additive: one new boolean column, default false, on the existing
-- users table. Nothing else changes. Not required before the portal works —
-- the backend gate degrades gracefully if this column doesn't exist yet
-- (same "zero-migration bootstrap" pattern as is_accountant) — but should be
-- run so the flag can actually be set to true for someone.
--
-- To grant access once this has run:
--   UPDATE users SET is_affiliate_manager = true WHERE email = '<their email>';
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_affiliate_manager BOOLEAN NOT NULL DEFAULT false;
