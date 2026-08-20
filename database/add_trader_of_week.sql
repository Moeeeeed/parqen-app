-- "Active Trader of the Week" badge, one row per market category, auto-picked
-- and auto-rotated by backend/services/traderOfWeekService.js instead of being
-- a hardcoded username in the frontend that only changes via a code deploy.
--
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql

CREATE TABLE IF NOT EXISTS public.trader_of_week (
  category          TEXT         PRIMARY KEY,  -- 'buy_bitcoin' | 'sell_bitcoin' | 'gift_card'
  user_id           UUID,
  username          TEXT,
  listing_id        UUID,
  total_trades      INTEGER,
  average_rating    NUMERIC,
  selected_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  next_rotation_at  TIMESTAMPTZ  NOT NULL
);

ALTER TABLE public.trader_of_week DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.trader_of_week TO service_role;
GRANT SELECT ON public.trader_of_week TO authenticated, anon;
