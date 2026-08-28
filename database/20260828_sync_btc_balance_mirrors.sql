-- PRAQEN — 2026-08-28 — Sync BTC balance mirrors in praqen_credit_deposit
--
-- Problem:
--   praqen_credit_deposit updates wallets.balance_btc (authoritative) but
--   never updates user_balances.balance_btc or user_wallets.balance_btc.
--   This causes MIRROR_DRIFT flags and "my deposit isn't showing" reports
--   on any surface that reads the legacy mirror tables.
--
-- Fix:
--   Atomically synchronize the existing BTC mirrors inside the RPC.
--   If a required mirror row is missing, the entire credit fails and rolls back.
--
-- USDT is intentionally NOT mirrored here — the mirror tables have no
-- balance_usdt column, and wallets.balance_usdt remains authoritative.
--
-- This migration MUST be run AFTER 20260828_backfill_balance_mirrors.sql
-- so that all 91 missing mirror rows already exist.
--
-- Run ONCE in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.praqen_credit_deposit(
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_onchain_balance numeric,
  p_idempotency_key text,
  p_note text DEFAULT NULL::text
)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be positive';
  END IF;

  IF p_currency NOT IN ('BTC', 'USDT') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY: must be BTC or USDT';
  END IF;

  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM wallets WHERE user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: user has no wallet';
  END IF;

  INSERT INTO wallet_transactions (
    user_id,
    type,
    currency,
    amount_btc,
    amount_usdt,
    status,
    notes,
    idempotency_key,
    created_at
  )
  VALUES (
    p_user_id,
    'DEPOSIT',
    p_currency,
    CASE WHEN p_currency = 'BTC' THEN p_amount ELSE 0 END,
    CASE WHEN p_currency = 'USDT' THEN p_amount ELSE 0 END,
    'CONFIRMED',
    p_note,
    p_idempotency_key,
    now()
  );

  IF p_currency = 'BTC' THEN
    UPDATE wallets
    SET balance_btc = balance_btc + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance_btc INTO v_new_balance;
  ELSE
    UPDATE wallets
    SET balance_usdt = balance_usdt + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance_usdt INTO v_new_balance;
  END IF;

  -- ── BTC mirror synchronization (NEW) ────────────────────────────────
  IF p_currency = 'BTC' THEN
    UPDATE user_balances
    SET balance_btc = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'BTC_BALANCE_MIRROR_MISSING: user_balances row not found for user %', p_user_id;
    END IF;

    UPDATE user_wallets
    SET balance_btc = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'BTC_WALLET_MIRROR_MISSING: user_wallets row not found for user %', p_user_id;
    END IF;
  END IF;

  -- ── On-chain checkpoint update ──────────────────────────────────────
  IF p_currency = 'BTC' THEN
    UPDATE user_wallets
    SET last_onchain_btc = p_onchain_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE user_wallets
    SET last_onchain_usdt = p_onchain_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'USER_WALLETS_NOT_FOUND: cannot advance deposit checkpoint';
  END IF;

  INSERT INTO balance_audit (
    user_id,
    change_btc,
    new_balance,
    reason,
    created_at
  )
  VALUES (
    p_user_id,
    CASE WHEN p_currency = 'BTC' THEN p_amount ELSE 0 END,
    v_new_balance,
    'DEPOSIT',
    now()
  );

  RETURN v_new_balance;
END;
$;
