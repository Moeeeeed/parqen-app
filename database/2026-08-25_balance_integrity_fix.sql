-- ============================================================================
-- PRAQEN Balance Integrity Fix — Phase 1-3/6 migration
-- Date: 2026-08-25
--
-- SAFETY: every statement in this file is additive (ADD COLUMN, CREATE TABLE,
-- CREATE INDEX, CREATE OR REPLACE FUNCTION) or a guarded DO block. Nothing
-- drops a column, drops a table, or rewrites existing balances. Safe to run
-- against production. Run the whole file once in the Supabase SQL Editor.
--
-- Schema referenced below was verified against the LIVE production schema via
-- the PostgREST OpenAPI introspection endpoint on 2026-08-25 (read-only GET),
-- not against the (stale/drifted) committed .sql migration files. See
-- BALANCE_MISMATCH_INVESTIGATION.md for the discrepancies found.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Idempotency key on the ledger (wallet_transactions)
-- ----------------------------------------------------------------------------
-- wallet_transactions currently has NO unique constraint of any kind besides
-- the id primary key — nothing stops the same financial event being logged
-- (and credited) twice. Nullable + partial unique index so every existing
-- row (idempotency_key IS NULL) is completely unaffected.
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_idempotency_key_uq
  ON wallet_transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. One row per user in `wallets`, enforced at the DB level
-- ----------------------------------------------------------------------------
-- Every RPC below assumes exactly one wallets row per user_id. The app has
-- always assumed this too (every read does .eq('user_id', X).single()) but
-- nothing in the schema actually enforces it. Add the constraint only if it's
-- safe to add (no existing duplicates) — if duplicates exist, this raises a
-- NOTICE instead of failing the whole migration, so you can see it and go
-- resolve those specific rows by hand before re-running just this block.
DO $$
DECLARE
  v_dupe_count INT;
BEGIN
  SELECT COUNT(*) INTO v_dupe_count FROM (
    SELECT user_id FROM wallets GROUP BY user_id HAVING COUNT(*) > 1
  ) d;

  IF v_dupe_count > 0 THEN
    RAISE NOTICE 'SKIPPED wallets_user_id_uq: % user_id(s) have more than one wallets row. Resolve those manually, then run: ALTER TABLE wallets ADD CONSTRAINT wallets_user_id_uq UNIQUE (user_id);', v_dupe_count;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'wallets_user_id_uq'
    ) THEN
      ALTER TABLE wallets ADD CONSTRAINT wallets_user_id_uq UNIQUE (user_id);
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Sanity-bound CHECK constraints (defense-in-depth against NaN/negative/
--    runaway values reaching the balance columns at all, from ANY caller —
--    including code paths this migration doesn't touch)
-- ----------------------------------------------------------------------------
-- Postgres NUMERIC sorts NaN as greater than every other value (unlike IEEE
-- float, where NaN comparisons are false) — so an upper bound catches NaN
-- too, not just negative/runaway values. Bounds are generous (BTC's own
-- 21M supply cap; a very large but finite USDT ceiling) so they can never
-- fire on any legitimate balance, only on corruption.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balance_btc_sane') THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_balance_btc_sane
      CHECK (balance_btc >= 0 AND balance_btc <= 21000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_locked_balance_btc_sane') THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_locked_balance_btc_sane
      CHECK (locked_balance_btc >= 0 AND locked_balance_btc <= 21000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balance_usdt_sane') THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_balance_usdt_sane
      CHECK (balance_usdt >= 0 AND balance_usdt <= 1000000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_locked_balance_usdt_sane') THEN
    ALTER TABLE wallets ADD CONSTRAINT wallets_locked_balance_usdt_sane
      CHECK (locked_balance_usdt >= 0 AND locked_balance_usdt <= 1000000000);
  END IF;
END $$;
-- NOTE: if this block raises a constraint-violation error instead of skipping,
-- it means at least one existing row is ALREADY negative/NaN/out of range.
-- Do not "fix" that by editing the constraint — that's exactly the kind of
-- mismatch this whole effort exists to find. Stop, note which constraint
-- failed, and treat the offending user_id as RECONCILIATION_REQUIRED (see
-- section 5) instead of silently bounding it away.

-- ----------------------------------------------------------------------------
-- 4. Reconciliation flags table (Phase 6 — detect & flag, never auto-correct)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reconciliation_flags (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency          TEXT NOT NULL CHECK (currency IN ('BTC', 'USDT')),
  source_table      TEXT NOT NULL,           -- e.g. 'user_balances', 'user_wallets', 'sync_failure'
  authoritative_value NUMERIC,               -- wallets.balance_* at flag time
  mirror_value      NUMERIC,                 -- the diverging value found
  diff              NUMERIC,
  reason            TEXT NOT NULL,           -- e.g. 'MIRROR_DRIFT', 'SYNC_FAILURE', 'NEGATIVE_BALANCE'
  status            TEXT NOT NULL DEFAULT 'RECONCILIATION_REQUIRED'
                      CHECK (status IN ('RECONCILIATION_REQUIRED', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE')),
  detail            JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES users(id),
  resolution_notes  TEXT
);

CREATE INDEX IF NOT EXISTS reconciliation_flags_status_idx ON reconciliation_flags (status);
CREATE INDEX IF NOT EXISTS reconciliation_flags_user_id_idx ON reconciliation_flags (user_id);

-- ----------------------------------------------------------------------------
-- 5. praqen_internal_transfer — atomic internal BTC/USDT transfer
-- ----------------------------------------------------------------------------
-- Replaces the unguarded read-JS-compute-write pattern in:
--   backend/routes/hdWalletRoutes.js (BTC internal transfer, ~line 464-570)
--   backend/server.js (USDT internal transfer, ~line 13410-13500)
-- Sender debit + recipient credit + both ledger rows happen in ONE Postgres
-- transaction: either both balances move together with both ledger rows
-- recorded, or nothing happens at all. Row locks are acquired in a fixed
-- (sorted-by-user_id) order to avoid deadlocking with a concurrent transfer
-- running the opposite direction between the same two users.
CREATE OR REPLACE FUNCTION praqen_internal_transfer(
  p_sender_id        UUID,
  p_recipient_id     UUID,
  p_currency         TEXT,
  p_amount           NUMERIC,
  p_idempotency_key  TEXT,
  p_note             TEXT DEFAULT NULL
)
RETURNS TABLE(sender_balance NUMERIC, recipient_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_bal    NUMERIC;
  v_new_sender    NUMERIC;
  v_new_recipient NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be a positive, finite number';
  END IF;
  IF p_sender_id IS NULL OR p_recipient_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_USER: sender and recipient are required';
  END IF;
  IF p_sender_id = p_recipient_id THEN
    RAISE EXCEPTION 'SELF_TRANSFER: cannot transfer to yourself';
  END IF;
  IF p_currency NOT IN ('BTC', 'USDT') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY: % — must be BTC or USDT', p_currency;
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  -- Lock both wallet rows up front, in a fixed order, so two transfers
  -- between the same pair of users (in either direction) can never deadlock.
  PERFORM 1 FROM wallets
    WHERE user_id IN (p_sender_id, p_recipient_id)
    ORDER BY user_id
    FOR UPDATE;

  IF p_currency = 'BTC' THEN
    SELECT balance_btc INTO v_sender_bal FROM wallets WHERE user_id = p_sender_id;
  ELSE
    SELECT balance_usdt INTO v_sender_bal FROM wallets WHERE user_id = p_sender_id;
  END IF;

  IF v_sender_bal IS NULL THEN
    RAISE EXCEPTION 'SENDER_WALLET_NOT_FOUND: user % has no wallets row', p_sender_id;
  END IF;
  IF v_sender_bal < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: sender has % %, requested %', v_sender_bal, p_currency, p_amount;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM wallets WHERE user_id = p_recipient_id) THEN
    RAISE EXCEPTION 'RECIPIENT_WALLET_NOT_FOUND: user % has no wallets row', p_recipient_id;
  END IF;

  -- Ledger rows first: if idempotency_key was already used, the unique index
  -- raises here and the whole function (including the locks) rolls back
  -- before any balance is touched.
  INSERT INTO wallet_transactions
    (user_id, type, currency, amount_btc, amount_usdt, status, notes, idempotency_key, created_at)
  VALUES
    (p_sender_id, 'TRANSFER_OUT', p_currency,
     CASE WHEN p_currency = 'BTC' THEN p_amount ELSE 0 END,
     CASE WHEN p_currency = 'USDT' THEN p_amount ELSE 0 END,
     'CONFIRMED', COALESCE(p_note, 'Internal transfer'), p_idempotency_key || ':OUT', now());

  INSERT INTO wallet_transactions
    (user_id, type, currency, amount_btc, amount_usdt, status, notes, idempotency_key, created_at)
  VALUES
    (p_recipient_id, 'TRANSFER_IN', p_currency,
     CASE WHEN p_currency = 'BTC' THEN p_amount ELSE 0 END,
     CASE WHEN p_currency = 'USDT' THEN p_amount ELSE 0 END,
     'CONFIRMED', COALESCE(p_note, 'Internal transfer received'), p_idempotency_key || ':IN', now());

  IF p_currency = 'BTC' THEN
    UPDATE wallets SET balance_btc = balance_btc - p_amount, updated_at = now()
      WHERE user_id = p_sender_id
      RETURNING balance_btc INTO v_new_sender;
    UPDATE wallets SET balance_btc = balance_btc + p_amount, updated_at = now()
      WHERE user_id = p_recipient_id
      RETURNING balance_btc INTO v_new_recipient;
  ELSE
    UPDATE wallets SET balance_usdt = balance_usdt - p_amount, updated_at = now()
      WHERE user_id = p_sender_id
      RETURNING balance_usdt INTO v_new_sender;
    UPDATE wallets SET balance_usdt = balance_usdt + p_amount, updated_at = now()
      WHERE user_id = p_recipient_id
      RETURNING balance_usdt INTO v_new_recipient;
  END IF;

  RETURN QUERY SELECT v_new_sender, v_new_recipient;
END;
$$;

REVOKE EXECUTE ON FUNCTION praqen_internal_transfer(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION praqen_internal_transfer(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. praqen_reject_withdrawal — atomic claim + refund + finalize
-- ----------------------------------------------------------------------------
-- Replaces the unguarded reject flow in backend/routes/hdWalletRoutes.js
-- (~line 1651-1711), which had no atomic claim unlike its approve sibling —
-- two concurrent reject calls on the same withdrawal could both refund.
-- The claim (PENDING_APPROVAL -> PROCESSING) is the same technique already
-- used by the approve endpoint, so only one caller ever proceeds. If the
-- refund credit fails for any reason, the claim is released back to
-- PENDING_APPROVAL (not marked REJECTED) so a retry is safe and the CEO
-- isn't left staring at a withdrawal that silently vanished.
CREATE OR REPLACE FUNCTION praqen_reject_withdrawal(
  p_tx_id  UUID,
  p_ceo_id UUID,
  p_reason TEXT
)
RETURNS TABLE(refunded_user_id UUID, refunded_amount NUMERIC, refunded_currency TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row      wallet_transactions%ROWTYPE;
  v_is_usdt  BOOLEAN;
  v_refund   NUMERIC;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  UPDATE wallet_transactions
  SET status = 'PROCESSING'
  WHERE id = p_tx_id AND status = 'PENDING_APPROVAL'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_REVIEWED: withdrawal % is not pending approval (already claimed/reviewed)', p_tx_id;
  END IF;

  v_is_usdt := (v_row.currency = 'USDT');
  IF v_is_usdt THEN
    v_refund := ROUND(COALESCE(v_row.amount_usdt, 0) + COALESCE(v_row.platform_fee_usdt, 0), 6);
  ELSE
    v_refund := ROUND(COALESCE(v_row.amount_btc, 0) + COALESCE(v_row.platform_fee_btc, 0), 8);
  END IF;

  BEGIN
    IF v_is_usdt THEN
      UPDATE wallets SET balance_usdt = balance_usdt + v_refund, updated_at = now()
        WHERE user_id = v_row.user_id;
    ELSE
      UPDATE wallets SET balance_btc = balance_btc + v_refund, updated_at = now()
        WHERE user_id = v_row.user_id;
    END IF;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WALLET_NOT_FOUND: user % has no wallets row', v_row.user_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Refund failed — release the claim so the CEO can safely retry rather
    -- than leaving this withdrawal permanently stuck at PROCESSING.
    UPDATE wallet_transactions SET status = 'PENDING_APPROVAL' WHERE id = p_tx_id;
    RAISE;
  END;

  UPDATE wallet_transactions
  SET status = 'REJECTED', reviewed_by = p_ceo_id, reviewed_at = now(), rejection_reason = p_reason
  WHERE id = p_tx_id;

  RETURN QUERY SELECT v_row.user_id, v_refund, v_row.currency;
END;
$$;

REVOKE EXECUTE ON FUNCTION praqen_reject_withdrawal(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION praqen_reject_withdrawal(UUID, UUID, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 7. praqen_credit_deposit — atomic on-chain deposit credit
-- ----------------------------------------------------------------------------
-- Replaces the multi-step orchestration in depositMonitor.js (Step 4c/5a/5b)
-- and usdtDepositMonitor.js (Step 2b/3/5): idempotency-key ledger insert +
-- checkpoint (last_onchain_btc/usdt) advance + balance credit + balance_audit
-- stamp now happen in ONE transaction. A crash anywhere inside this call
-- rolls back everything — there is no longer a window where the checkpoint
-- advances without the credit landing (the gap identified in the 2026-08-25
-- investigation). Requires the wallets row to already exist (it always does
-- for a real user with a provisioned deposit address); if it doesn't, this
-- raises loudly instead of silently guessing at NOT NULL columns like
-- private_key that this function has no business setting.
CREATE OR REPLACE FUNCTION praqen_credit_deposit(
  p_user_id          UUID,
  p_currency         TEXT,
  p_amount           NUMERIC,
  p_onchain_balance  NUMERIC,
  p_idempotency_key  TEXT,
  p_note             TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be a positive, finite number';
  END IF;
  IF p_currency NOT IN ('BTC', 'USDT') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY: % — must be BTC or USDT', p_currency;
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  -- Idempotency gate — a unique violation here rolls back the whole function,
  -- so a retried/duplicated deposit event is a guaranteed no-op.
  INSERT INTO wallet_transactions
    (user_id, type, currency, amount_btc, amount_usdt, status, notes, idempotency_key, created_at)
  VALUES
    (p_user_id, 'DEPOSIT', p_currency,
     CASE WHEN p_currency = 'BTC' THEN p_amount ELSE 0 END,
     CASE WHEN p_currency = 'USDT' THEN p_amount ELSE 0 END,
     'CONFIRMED', p_note, p_idempotency_key, now());

  IF p_currency = 'BTC' THEN
    UPDATE wallets SET balance_btc = balance_btc + p_amount, updated_at = now()
      WHERE user_id = p_user_id
      RETURNING balance_btc INTO v_new_balance;
  ELSE
    UPDATE wallets SET balance_usdt = balance_usdt + p_amount, updated_at = now()
      WHERE user_id = p_user_id
      RETURNING balance_usdt INTO v_new_balance;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: user % has no wallets row — cannot credit deposit', p_user_id;
  END IF;

  -- Advance the on-chain checkpoint atomically with the credit (this is the
  -- fix for the crash-window gap: these can no longer land separately).
  IF p_currency = 'BTC' THEN
    UPDATE user_wallets SET last_onchain_btc = p_onchain_balance, updated_at = now()
      WHERE user_id = p_user_id;
  ELSE
    UPDATE user_wallets SET last_onchain_usdt = p_onchain_balance, updated_at = now()
      WHERE user_id = p_user_id;
  END IF;

  -- Without this check, a wallets/user_wallets mismatch would let the balance
  -- credit above commit while the checkpoint silently fails to advance — the
  -- next real deposit would then be computed against the stale checkpoint and
  -- double-count this one. Raising here rolls back the whole call (ledger
  -- insert + balance credit included), same as the WALLET_NOT_FOUND check above.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_WALLETS_NOT_FOUND: user % has no user_wallets row — cannot advance on-chain checkpoint', p_user_id;
  END IF;

  INSERT INTO balance_audit (user_id, change_btc, new_balance, reason, created_at)
  VALUES (p_user_id, CASE WHEN p_currency = 'BTC' THEN p_amount ELSE 0 END, v_new_balance, 'DEPOSIT', now());

  RETURN v_new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION praqen_credit_deposit(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION praqen_credit_deposit(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;

-- ============================================================================
-- End of migration. Nothing above modifies an existing balance value.
-- ============================================================================
