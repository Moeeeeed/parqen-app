-- Lets a specific special-offer slot be manually pinned to a chosen trader
-- (e.g. an admin decision to feature someone regardless of the auto-ranking).
-- backend/services/traderOfWeekService.js skips recomputing any row where
-- pinned = true during its weekly rotation, so a manual pick sticks until
-- someone explicitly un-pins it.
--
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql

ALTER TABLE public.trader_of_week ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
