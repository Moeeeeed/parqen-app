-- PRAQEN — 2026-08-28 — Back-fill missing balance mirror rows
--
-- Problem:
--   ~90 users are missing user_balances rows.
--   3 users are missing user_wallets rows.
--   Before the praqen_credit_deposit RPC can hard-fail on missing mirrors,
--   all mirrors must exist.
--
-- This migration ONLY inserts missing rows. It NEVER overwrites existing data.
-- Checkpoint fields (last_onchain_*) are initialized to 0 — safe because
-- deposit_tracking_v2 is the actual idempotency source, not these checkpoints.
--
-- Run ONCE in Supabase SQL Editor.
-- Review before execution.

BEGIN;

-- ── Step 1: Back-fill missing user_balances ──────────────────────────────
INSERT INTO public.user_balances (user_id, balance_btc, balance_usd, updated_at, last_onchain_btc)
SELECT
  w.user_id,
  w.balance_btc,
  w.balance_usd,
  NOW(),
  0
FROM public.wallets w
LEFT JOIN public.user_balances ub ON ub.user_id = w.user_id
WHERE ub.user_id IS NULL;

-- ── Step 2: Back-fill missing user_wallets ───────────────────────────────
INSERT INTO public.user_wallets (
  user_id,
  btc_address,
  balance_btc,
  created_at,
  updated_at,
  network,
  is_deposit_address,
  last_onchain_btc,
  tron_address,
  last_onchain_usdt
)
SELECT
  w.user_id,
  w.address,
  w.balance_btc,
  NOW(),
  NOW(),
  'mainnet',
  true,
  0,
  w.tron_address,
  0
FROM public.wallets w
LEFT JOIN public.user_wallets uw ON uw.user_id = w.user_id
WHERE uw.user_id IS NULL;

-- ── Step 3: Post-migration assertion ─────────────────────────────────────
DO $
DECLARE
  v_missing_balances integer;
  v_missing_wallets integer;
BEGIN
  SELECT COUNT(*)
  INTO v_missing_balances
  FROM public.wallets w
  LEFT JOIN public.user_balances ub ON ub.user_id = w.user_id
  WHERE ub.user_id IS NULL;

  SELECT COUNT(*)
  INTO v_missing_wallets
  FROM public.wallets w
  LEFT JOIN public.user_wallets uw ON uw.user_id = w.user_id
  WHERE uw.user_id IS NULL;

  IF v_missing_balances <> 0 OR v_missing_wallets <> 0 THEN
    RAISE EXCEPTION
      'Mirror backfill incomplete: user_balances=%, user_wallets=%',
      v_missing_balances, v_missing_wallets;
  END IF;
END $;

COMMIT;
