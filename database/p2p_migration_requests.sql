-- ============================================================
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql
--
-- Also create a PUBLIC storage bucket named "p2p-migration" in
-- Supabase Storage (same way "kyc-documents" was set up) so
-- screenshot uploads have somewhere to land.
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_p2p_migration_status     ON public.p2p_migration_requests(status);
CREATE INDEX IF NOT EXISTS idx_p2p_migration_created_at ON public.p2p_migration_requests(created_at DESC);

-- Disable RLS so the service role can read/write freely
ALTER TABLE public.p2p_migration_requests DISABLE ROW LEVEL SECURITY;

-- Grant access to the service role (usually already set, but explicit is safer)
GRANT ALL ON public.p2p_migration_requests TO service_role;
GRANT ALL ON public.p2p_migration_requests TO authenticated;
