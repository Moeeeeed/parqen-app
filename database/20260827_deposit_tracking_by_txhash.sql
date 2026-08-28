-- ============================================================
-- Step 1 of the permanent deposit-detection fix. NOT RUN — review and run
-- yourself in the Supabase SQL Editor when ready, same convention as every
-- other migration in this repo.
-- ============================================================
--
-- WHY THIS REPLACES THE OLD deposit_tracking DESIGN:
-- The original committed deposit_tracking.sql (still in this repo, untouched
-- by this file) keyed idempotency on (user_id, currency, onchain_balance) —
-- a balance SNAPSHOT, not a specific transaction. That's the same
-- snapshot-comparison design that caused the recurring "deposit swept before
-- it was noticed" bug (king888, ukbuyer2022, Iraqiy_Xchange). The live
-- production table doesn't even match that file — it was found (read-only,
-- via direct schema introspection) to actually have only
-- (tx_hash PRIMARY KEY, user_id, processed_at), and every insert from the
-- current code has been failing since inception because of that mismatch —
-- confirmed 0 rows, ever. Nothing today depends on its current shape, so
-- redefining it here is safe.
--
-- NEW DESIGN: track by transaction hash, not balance snapshot. Once a txid
-- is recorded here, it is never re-evaluated as "new" again — regardless of
-- what happens to the address's balance afterward (a sweep moving the coins
-- out immediately cannot make this row disappear, unlike the old
-- balance-checkpoint approach).
--
-- Unique key is (tx_hash, address) rather than tx_hash alone: extremely
-- rare, but a single on-chain transaction CAN pay out to more than one of
-- your deposit addresses in one broadcast (e.g. a batched exchange
-- withdrawal). Keying on the pair still correctly treats each address's
-- portion as its own distinct, once-only credit.

CREATE TABLE IF NOT EXISTS public.deposit_tracking_v2 (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  tx_hash       TEXT          NOT NULL,
  address       TEXT          NOT NULL,
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency      TEXT          NOT NULL CHECK (currency IN ('BTC', 'USDT')),
  amount        NUMERIC(24,8) NOT NULL CHECK (amount > 0),
  -- Distinguishes "we've seen this transaction" from "we've successfully
  -- credited it" — a transaction can be recorded here the moment it's seen,
  -- before the credit RPC has run, so two near-simultaneous checks (the
  -- realtime monitor and the hourly reconciliation safety net) can't both
  -- try to credit the same transaction.
  credited      BOOLEAN       NOT NULL DEFAULT false,
  credit_error  TEXT,
  -- Which layer caught this — lets you see later whether the safety-net
  -- reconciliation job is actually pulling its weight, or if the realtime
  -- monitor is catching everything on its own.
  detected_by   TEXT          NOT NULL DEFAULT 'realtime_monitor' CHECK (detected_by IN ('realtime_monitor', 'reconciliation_job', 'manual')),
  detected_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  credited_at   TIMESTAMPTZ,
  UNIQUE (tx_hash, address)
);

CREATE INDEX IF NOT EXISTS idx_deposit_tracking_v2_user      ON public.deposit_tracking_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_tracking_v2_uncredited ON public.deposit_tracking_v2(credited) WHERE credited = false;

ALTER TABLE public.deposit_tracking_v2 DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.deposit_tracking_v2 TO service_role;

-- Deliberately a NEW table (deposit_tracking_v2), not an ALTER of the old
-- deposit_tracking — so Step 2/3 can be built and tested against this
-- table while the existing (already-broken, already-inert) code path is
-- completely undisturbed until you approve cutting over to it. The old
-- table can be dropped in a later, separate migration once the new one is
-- proven live — not part of this step.
