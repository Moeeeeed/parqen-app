-- Adds the payment_method column POST /api/trades/:id/feedback (backend/server.js)
-- has been trying to write on every review insert since the payment-method-scoped
-- feedback anti-abuse feature was added — the reviews table never actually had this
-- column, so every feedback submission has been failing at the insert with
-- "column reviews.payment_method does not exist".
--
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS payment_method TEXT;
