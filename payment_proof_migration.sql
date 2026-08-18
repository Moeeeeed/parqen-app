-- ================================================================
-- PRAQEN: Payment Proof on Trades — Schema
-- Run once in Supabase SQL Editor before restarting the backend.
-- Safe to run multiple times (idempotent).
-- ================================================================

ALTER TABLE trades ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS payment_proof_at  TIMESTAMPTZ;
