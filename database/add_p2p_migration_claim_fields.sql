-- Add user-submitted claim fields to p2p_migration_requests, plus a user_id
-- link so a logged-in user can check their own pending/approved/rejected
-- status (GET /api/p2p-migration/my-status) instead of the form always
-- re-showing empty on reload.
--
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql

ALTER TABLE public.p2p_migration_requests ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.p2p_migration_requests ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.p2p_migration_requests ADD COLUMN IF NOT EXISTS feedback_count TEXT;

CREATE INDEX IF NOT EXISTS idx_p2p_migration_user_id ON public.p2p_migration_requests(user_id);
