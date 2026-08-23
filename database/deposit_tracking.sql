-- ============================================================
-- Run this in Supabase SQL Editor:
-- https://app.supabase.com/project/pyzjcigibjheuugvpbwx/sql
-- ============================================================
--
-- Fix: BTC/USDT duplicate deposit credits.
-- Root cause: deposit detection compares on-chain balance against a
-- checkpoint (last_onchain_btc / last_onchain_usdt) and credits the
-- delta — but the realtime WebSocket trigger and the periodic poll (or
-- a manual "check my deposit" request) can both reach the crediting
-- step for the same address within ~0.2-0.4s of each other. The app
-- code now guards this with an optimistic lock on the wallet balance
-- write, but that only protects the write it wraps — this table adds
-- a hard, database-level constraint as the primary gate, upstream of
-- that: whichever concurrent request tries to record processing a
-- given (user, currency, on-chain-balance) state second gets rejected
-- by the unique constraint itself, atomically, before either
-- ever touches the user's balance.
--
-- Deposits here are detected by balance delta, not by a specific
-- on-chain transaction hash (BTC deposit rows are logged with
-- tx_hash = NULL), so a (user_id, tx_hash) constraint isn't usable —
-- the on-chain balance value itself is the natural idempotency key:
-- each distinct on-chain balance can only be reached once on the way up.

CREATE TABLE IF NOT EXISTS public.deposit_tracking (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID         NOT NULL,
  currency         TEXT         NOT NULL,  -- 'BTC' | 'USDT'
  onchain_balance  NUMERIC(24,8) NOT NULL, -- the on-chain balance this credit was based on
  amount_credited  NUMERIC(24,8) NOT NULL,
  processed_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, currency, onchain_balance)
);

CREATE INDEX IF NOT EXISTS idx_deposit_tracking_user ON public.deposit_tracking(user_id);

-- Disable RLS so the service role can read/write freely
ALTER TABLE public.deposit_tracking DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.deposit_tracking TO service_role;
GRANT ALL ON public.deposit_tracking TO authenticated;
