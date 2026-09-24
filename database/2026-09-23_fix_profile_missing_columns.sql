-- ============================================================
-- Fix: profile endpoint falling back to "essentials" because of
-- missing schema on THIS Supabase project.
--
--   [GET /api/users/profile] extraFields column missing — retrying
--   with essentials: column users.p2p_migrated_platform does not exist
--   [GET /api/users/profile] Column missing — falling back to
--   essentials: column users.is_moderator_scoped does not exist
--
-- Root cause: migrations existed as repo files but were never run
-- against this project (older SQL files reference the previous
-- Supabase project pyzjcigibjheuugvpbwx; this backend now uses a
-- different project). This file consolidates them, idempotent, so it
-- is safe to re-run. Verified missing on 2026-09-23 by probing every
-- column GET /api/users/profile selects.
--
-- Run in Supabase SQL Editor for the CURRENT project (see
-- SUPABASE_URL in backend/.env), then restart nothing — the backend
-- fallback only triggers on query error, so once these exist the
-- full query succeeds immediately.
--
-- Also manual (Supabase Dashboard → Storage, not SQL):
--   Create a PUBLIC storage bucket named "p2p-migration"
--   (same way "kyc-documents" was set up) so migration screenshot
--   uploads have somewhere to land.
-- ============================================================

-- ── 1. Moderator Dashboard scoped permission (users table) ─────────
-- Narrow, moderator-page-only permission. Distinct from is_moderator:
-- wired ONLY into the /moderator endpoints (dispute list/detail/
-- resolve/comments, dispute-history, oath, team list, moderator-join).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_moderator_scoped BOOLEAN DEFAULT false;

-- ── 2. P2P migration reputation stamp on the profile (users table) ─
-- Stamped when an approved p2p_migration_requests row is linked by
-- email (at admin approval, or at signup if registration came later).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS p2p_migrated_platform    TEXT,
  ADD COLUMN IF NOT EXISTS p2p_migrated_username    TEXT,
  ADD COLUMN IF NOT EXISTS p2p_migrated_feedback    TEXT,
  ADD COLUMN IF NOT EXISTS p2p_migration_approved_at TIMESTAMPTZ;

-- ── 3. P2P migration requests table (submit/review flow) ───────────
CREATE TABLE IF NOT EXISTS public.p2p_migration_requests (
  id                    UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  email                 TEXT         NOT NULL,
  platform              TEXT         NOT NULL DEFAULT 'other',   -- noones | binance | other
  screenshot_url        TEXT,
  status                TEXT         NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  admin_username_seen   TEXT,        -- trader's username on the old platform, logged by admin during review
  admin_feedback_count  TEXT,        -- feedback/trade count admin saw in the screenshot
  admin_notes           TEXT,
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           UUID,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- User-submitted claim fields + user_id link (GET /api/p2p-migration/my-status)
ALTER TABLE public.p2p_migration_requests ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.p2p_migration_requests ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.p2p_migration_requests ADD COLUMN IF NOT EXISTS feedback_count TEXT;

CREATE INDEX IF NOT EXISTS idx_p2p_migration_status     ON public.p2p_migration_requests(status);
CREATE INDEX IF NOT EXISTS idx_p2p_migration_created_at ON public.p2p_migration_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2p_migration_user_id    ON public.p2p_migration_requests(user_id);

-- Disable RLS so the service role can read/write freely
ALTER TABLE public.p2p_migration_requests DISABLE ROW LEVEL SECURITY;

-- Grant access (usually already set, but explicit is safer)
GRANT ALL ON public.p2p_migration_requests TO service_role;
GRANT ALL ON public.p2p_migration_requests TO authenticated;

-- ============================================================
-- Verification query — run after the block above; every row should
-- say "OK":
--   SELECT 'users.is_moderator_scoped' AS check, is_moderator_scoped FROM users LIMIT 1;
--   SELECT p2p_migrated_platform, p2p_migrated_username, p2p_migrated_feedback, p2p_migration_approved_at FROM users LIMIT 1;
--   SELECT COUNT(*) FROM p2p_migration_requests;
-- ============================================================
