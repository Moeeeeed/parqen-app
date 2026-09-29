-- ─────────────────────────────────────────────────────────────────────────────
-- Affiliate Program: atomic commission claim.
--
-- Replaces a JS-orchestrated SELECT-then-UPDATE-then-credit sequence (unsafe
-- under concurrency — see the review that flagged it) with a single Postgres
-- function, same shape as the existing praqen_internal_transfer /
-- praqen_credit_deposit functions in 2026-08-25_balance_integrity_fix.sql.
-- Don't invent a new pattern — this mirrors those two exactly.
--
-- Safety properties, each mapped to why it's safe:
--   1. Double-claim race: the UPDATE ... WHERE claimed_at IS NULL RETURNING
--      below is the ONLY read of "what's unclaimed" — there is no separate
--      SELECT beforehand. A second concurrent call simply sees zero rows,
--      because the first call's UPDATE has already committed (or is holding
--      the row locks until it does). Nothing to race against.
--   2. Partial failure: everything below — the claim, the idempotency-key
--      ledger insert, and the wallet credit — runs inside this one function.
--      Postgres rolls back the entire function on any unhandled exception,
--      so there is no window where commission is marked claimed but the
--      wallet was never credited, or the reverse.
--   3. Idempotency: wallet_transactions.idempotency_key already has a unique
--      index (wallet_transactions_idempotency_key_uq, from the same
--      2026-08-25 migration). A genuine duplicate call raises a unique
--      violation here, which rolls back the whole function — belt-and-
--      suspenders on top of #1, not a substitute for it.
--   4. $10 threshold: checked AFTER the atomic claim, not before, and
--      failing it raises an exception that rolls back the claim too — the
--      rows go right back to unclaimed. There is no window between "check"
--      and "claim" for a race to slip through, because there is no such
--      window at all.
--
-- BTC needs a live USD price to convert commission_usd into an actual BTC
-- amount; Postgres can't fetch that itself, so the caller (Node) fetches it
-- fresh (not cached) immediately before calling this function and passes it
-- in. USDT is a stablecoin, credited 1:1 with no price needed.
--
-- Run once in Supabase (SQL Editor), after 2026-09-27_affiliate_commission_ledger.sql
-- and its claimed_at follow-up have both already been run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION praqen_claim_affiliate_commission(
  p_affiliate_id   UUID,
  p_btc_price_usd  NUMERIC DEFAULT NULL  -- required only if there's BTC-currency commission to claim
)
RETURNS TABLE(claimed_usd NUMERIC, credited_btc NUMERIC, credited_usdt NUMERIC, new_balance_btc NUMERIC, new_balance_usdt NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_threshold_usd CONSTANT NUMERIC := 10; -- authoritative here, not trusted from the caller
  v_now           TIMESTAMPTZ := now();
  v_btc_usd       NUMERIC := 0;
  v_usdt_usd      NUMERIC := 0;
  v_total_usd     NUMERIC := 0;
  v_btc_count     INT := 0;
  v_usdt_count    INT := 0;
  v_btc_amount    NUMERIC := 0;
  v_usdt_amount   NUMERIC := 0;
  v_new_btc       NUMERIC;
  v_new_usdt      NUMERIC;
  v_idem_base     TEXT;
BEGIN
  IF p_affiliate_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_USER: affiliate id is required';
  END IF;

  -- ── The atomic claim ────────────────────────────────────────────────────
  -- One statement: claims every unclaimed row for this affiliate AND
  -- aggregates them by currency, in the same breath. This is what actually
  -- prevents the double-claim race — see note #1 above.
  WITH claimed AS (
    UPDATE affiliate_commission_ledger
    SET claimed_at = v_now
    WHERE affiliate_id = p_affiliate_id AND claimed_at IS NULL
    RETURNING currency, commission_usd
  )
  SELECT
    COALESCE(SUM(commission_usd) FILTER (WHERE currency = 'BTC'), 0),
    COALESCE(SUM(commission_usd) FILTER (WHERE currency = 'USDT'), 0),
    COALESCE(SUM(commission_usd), 0),
    COUNT(*) FILTER (WHERE currency = 'BTC'),
    COUNT(*) FILTER (WHERE currency = 'USDT')
  INTO v_btc_usd, v_usdt_usd, v_total_usd, v_btc_count, v_usdt_count
  FROM claimed;

  -- Threshold check AFTER the claim, not before — see note #4 above. Raising
  -- here rolls back the claimed_at update too; nothing is lost.
  IF v_total_usd < v_threshold_usd THEN
    RAISE EXCEPTION 'BELOW_THRESHOLD: balance $% is below the $% minimum', v_total_usd, v_threshold_usd;
  END IF;

  IF v_btc_usd > 0 THEN
    IF p_btc_price_usd IS NULL OR p_btc_price_usd <= 0 THEN
      RAISE EXCEPTION 'INVALID_BTC_PRICE: a live BTC price is required to credit % USD of BTC-trade commission', v_btc_usd;
    END IF;
    v_btc_amount := v_btc_usd / p_btc_price_usd;
  END IF;
  v_usdt_amount := v_usdt_usd; -- 1 USD commission = 1 USDT, no conversion

  v_idem_base := 'affiliate_claim_' || p_affiliate_id::text || '_' || extract(epoch from v_now)::text;

  -- ── Idempotency ledger rows (one per currency actually credited) ────────
  -- Inserted before the wallet write, mirroring praqen_credit_deposit /
  -- praqen_internal_transfer exactly — see note #3 above. currency has a
  -- CHECK (currency IN ('BTC','USDT')) constraint, so this is two rows when
  -- both currencies are present, never one combined row.
  IF v_btc_amount > 0 THEN
    INSERT INTO wallet_transactions
      (user_id, type, currency, amount_btc, status, notes, idempotency_key, created_at)
    VALUES
      (p_affiliate_id, 'AFFILIATE_CLAIM', 'BTC', v_btc_amount, 'CONFIRMED',
       format('Affiliate commission claimed — $%s USD from %s BTC-trade commission row(s)', v_btc_usd, v_btc_count),
       v_idem_base || ':BTC', v_now);

    UPDATE wallets SET balance_btc = balance_btc + v_btc_amount, updated_at = v_now
      WHERE user_id = p_affiliate_id
      RETURNING balance_btc INTO v_new_btc;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND: user % has no wallets row — cannot credit BTC commission', p_affiliate_id;
    END IF;
  END IF;

  IF v_usdt_amount > 0 THEN
    INSERT INTO wallet_transactions
      (user_id, type, currency, amount_usdt, status, notes, idempotency_key, created_at)
    VALUES
      (p_affiliate_id, 'AFFILIATE_CLAIM', 'USDT', v_usdt_amount, 'CONFIRMED',
       format('Affiliate commission claimed — $%s USD from %s USDT-trade commission row(s)', v_usdt_usd, v_usdt_count),
       v_idem_base || ':USDT', v_now);

    UPDATE wallets SET balance_usdt = balance_usdt + v_usdt_amount, updated_at = v_now
      WHERE user_id = p_affiliate_id
      RETURNING balance_usdt INTO v_new_usdt;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND: user % has no wallets row — cannot credit USDT commission', p_affiliate_id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_total_usd, v_btc_amount, v_usdt_amount, v_new_btc, v_new_usdt;
END;
$$;

REVOKE EXECUTE ON FUNCTION praqen_claim_affiliate_commission(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION praqen_claim_affiliate_commission(UUID, NUMERIC) TO service_role;
