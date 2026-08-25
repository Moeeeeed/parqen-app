-- PRAQEN Traders of the Week redesign — 5 fixed recognition slots, admin-selected
-- (not auto-rotated). See backend/services/traderOfWeekService.js.
--
-- Slots: sell_bitcoin_gh, buy_bitcoin_global, gift_card, kenya_market, rising_trader
--
-- NOTE: the live trader_of_week table already has `slot`, `score`, `reason`,
-- `selected_by`, `selected_by_username`, and `history` columns from an earlier,
-- untracked manual change (not present in any committed migration) — this file
-- was revised to reuse those instead of adding duplicate/overlapping ones.
-- traderOfWeekService.js writes admin identity into selected_by/selected_by_username
-- and the numeric ranking score into score; only pin_expires_at and stats_snapshot
-- below are genuinely new.
--
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql

ALTER TABLE public.trader_of_week ADD COLUMN IF NOT EXISTS pin_expires_at TIMESTAMPTZ;
ALTER TABLE public.trader_of_week ADD COLUMN IF NOT EXISTS stats_snapshot JSONB;

-- ── Append-only history of every selection ever made. trader_of_week reflects
-- "now"; this reflects "everything that was ever chosen, by whom, and why" —
-- never updated or overwritten, only inserted into. (Deliberately a separate
-- table rather than the existing `history` column on trader_of_week itself,
-- so a bug or accidental overwrite of that row can never lose past records.)
CREATE TABLE IF NOT EXISTS public.trader_of_week_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category              TEXT NOT NULL,
  user_id               UUID,
  username              TEXT,
  selected_by           UUID,
  selected_by_username  TEXT,
  selected_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,
  stats_snapshot        JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trader_of_week_history_category ON public.trader_of_week_history(category);
CREATE INDEX IF NOT EXISTS idx_trader_of_week_history_user_id  ON public.trader_of_week_history(user_id);

ALTER TABLE public.trader_of_week_history DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.trader_of_week_history TO service_role;
GRANT SELECT ON public.trader_of_week_history TO authenticated, anon;

-- ── Retire the old per-country pin/unpin SQL-only helper functions — replaced
-- by POST /api/admin/trader-of-week/select, which does the same "one badge
-- per user" bookkeeping in application code and also writes trader_of_week_history
-- (something the old SQL function never did). Old country-keyed rows
-- (e.g. 'buy_bitcoin:GH') are left in place untouched, just no longer read.
DROP FUNCTION IF EXISTS pin_trader_of_week(text, text);
DROP FUNCTION IF EXISTS unpin_trader_of_week(text);
