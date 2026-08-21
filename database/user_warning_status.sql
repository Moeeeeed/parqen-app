-- ================================================================
-- PRAQEN: User Warning Status — Trust/Safety Visibility
-- Run this in Supabase SQL Editor.
--
-- account_status already covers 'active' / 'banned' (see admin_columns.sql
-- and schema.sql) and is enforced by backend/middleware/requireNotBanned.js
-- for fund movement. This migration adds a SEPARATE warning flag rather
-- than a third account_status value, because a warned user should still be
-- able to trade normally (has_warning = true AND account_status = 'active'
-- at the same time) — only banned accounts are blocked from money movement.
-- ================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS has_warning     BOOLEAN     DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS warning_reason  TEXT        DEFAULT NULL; -- admin-only, never exposed to other users
ALTER TABLE users ADD COLUMN IF NOT EXISTS warned_at       TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS warned_by       UUID        REFERENCES users(id) ON DELETE SET NULL; -- admin-only

CREATE INDEX IF NOT EXISTS idx_users_has_warning ON users(has_warning);

-- admin_audit_log.action already accepts any VARCHAR(50) — WARN / UNWARN
-- actions are logged the same way as the existing BAN / UNBAN actions via
-- logAdminAction(), no schema change needed there.
