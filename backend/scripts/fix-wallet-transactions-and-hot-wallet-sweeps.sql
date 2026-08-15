-- ============================================================
-- PRAQEN — Fix USDT deposit audit trail + create missing sweep table
-- Run ONCE in the Supabase SQL editor.
-- SAFETY: purely additive — no data is altered or deleted,
-- no existing column is dropped or made stricter.
-- ============================================================

-- ── Fix 1: wallet_transactions.amount_btc NOT NULL was blocking every
-- USDT-only insert (deposits, and any other USDT-only transaction type)
-- that doesn't set a BTC amount. Confirmed live in production:
--   "null value in column \"amount_btc\" of relation \"wallet_transactions\"
--    violates not-null constraint"
-- A DEFAULT keeps the NOT NULL guarantee but stops rejecting USDT-only rows.
ALTER TABLE wallet_transactions ALTER COLUMN amount_btc SET DEFAULT 0;
ALTER TABLE wallet_transactions ALTER COLUMN amount_usdt SET DEFAULT 0;

-- ── Fix 2: hot_wallet_sweeps table referenced by services/tronHotWallet.js
-- (_recordSweep / processPendingSweeps) does not exist yet, so every sweep
-- attempt — success or failure — has been failing to log silently:
--   "Could not find the table 'public.hot_wallet_sweeps' in the schema cache"
-- This is the audit trail + retry queue for moving deposited USDT from
-- per-user deposit addresses into the platform hot wallet.
CREATE TABLE IF NOT EXISTS hot_wallet_sweeps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  from_address TEXT NOT NULL,
  amount_usdt  NUMERIC NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | COMPLETED | STALE
  txid         TEXT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hot_wallet_sweeps_status ON hot_wallet_sweeps(status);
CREATE INDEX IF NOT EXISTS idx_hot_wallet_sweeps_user   ON hot_wallet_sweeps(user_id);

-- ── Verification — run after the migration ─────────────────────────────
-- SELECT column_name, column_default FROM information_schema.columns
--  WHERE table_name = 'wallet_transactions' AND column_name IN ('amount_btc','amount_usdt');
-- SELECT COUNT(*) FROM hot_wallet_sweeps;
