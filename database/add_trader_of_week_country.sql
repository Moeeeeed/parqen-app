-- Extends trader_of_week for the per-country special-offer flow (backend/services/
-- traderOfWeekService.js): category rows are now keyed "buy_bitcoin:GH", "sell_bitcoin:NG",
-- etc. (still TEXT, no PK change needed), and the sell-page winner also records which
-- local payment method (e.g. 'mtn' for Ghana) they qualified on.
--
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql

ALTER TABLE public.trader_of_week ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.trader_of_week ADD COLUMN IF NOT EXISTS payment_method TEXT;
