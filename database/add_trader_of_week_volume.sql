-- Adds real trade-volume tracking to the "Trader of the Week" badges (backend/
-- services/traderOfWeekService.js), so the Live Pinned Offer banner can show an
-- actual "₵870,331 GHS · 7 days" style line instead of just trades/rating.
--
-- volume_usd  = sum of amount_usd across the winner's COMPLETED trades in the
--               window below (converted to local currency on the frontend).
-- volume_days = how many days that volume was actually earned over (can be
--               less than the rotation window if they only traded recently).
--
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql

ALTER TABLE public.trader_of_week ADD COLUMN IF NOT EXISTS volume_usd NUMERIC;
ALTER TABLE public.trader_of_week ADD COLUMN IF NOT EXISTS volume_days INTEGER;
