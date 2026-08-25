-- ============================================================
-- PRAQEN — Treasury Migration Tracking
-- NOT YET RUN. Drafted for review only — do not run in Supabase SQL
-- Editor until the migration plan is explicitly approved.
--
-- Two tables, both purely additive — neither one touches wallets,
-- user_wallets, users, or any balance field. They exist to make the
-- BTC treasury migration (moving off the mnemonic exposed in Git
-- history) auditable and reversible-in-spirit, per the migration plan.
-- ============================================================

-- ── 1. user_address_migrations — old → new BTC address mapping ────────────
-- One row per user whose deposit address moved from the old (compromised)
-- mnemonic to the new one. The OLD address is preserved here permanently —
-- migrating a user's live address in wallets/user_wallets/users must never
-- simply overwrite it without first writing that old value here.
-- Does NOT touch any balance field on any table.
CREATE TABLE IF NOT EXISTS user_address_migrations (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID          NOT NULL,
  old_btc_address       TEXT          NOT NULL,
  new_btc_address       TEXT          NOT NULL,
  old_address_balance_at_migration_sats BIGINT NOT NULL DEFAULT 0, -- on-chain balance found at the old address at the moment of migration (read-only check, not a credit/debit)
  monitoring_status     TEXT          NOT NULL DEFAULT 'ACTIVE'
                        CHECK (monitoring_status IN ('ACTIVE', 'CLOSED')), -- ACTIVE = still being checked for late deposits; CLOSED = monitoring window ended
  migrated_at           TIMESTAMPTZ   DEFAULT now(),
  monitoring_closed_at  TIMESTAMPTZ,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_uam_user_id      ON user_address_migrations(user_id);
CREATE INDEX IF NOT EXISTS idx_uam_old_address  ON user_address_migrations(old_btc_address);
CREATE INDEX IF NOT EXISTS idx_uam_status       ON user_address_migrations(monitoring_status);

ALTER TABLE user_address_migrations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_address_migrations' AND policyname = 'Service role full access to user_address_migrations'
  ) THEN
    CREATE POLICY "Service role full access to user_address_migrations"
      ON user_address_migrations FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 2. late_deposit_sweeps — old-address monitoring findings ──────────────
-- A row is inserted whenever the daily/continuous old-address monitor finds
-- a late deposit at an address that's supposed to be retired. The sweep
-- (moving the on-chain BTC to the new treasury) is safe to do automatically —
-- it never touches a user balance. Crediting the user is a SEPARATE, manual
-- decision — that's what balance_credit_status tracks, and it starts at
-- NEEDS_REVIEW on every row, never auto-approved.
CREATE TABLE IF NOT EXISTS late_deposit_sweeps (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID          NOT NULL,
  old_btc_address       TEXT          NOT NULL,
  detected_at           TIMESTAMPTZ   DEFAULT now(),
  amount_sats           BIGINT        NOT NULL,
  swept_to_treasury_txid TEXT,        -- filled in once the sweep itself broadcasts
  swept_status          TEXT          NOT NULL DEFAULT 'PENDING'
                        CHECK (swept_status IN ('PENDING', 'SWEPT', 'FAILED')),
  balance_credit_status TEXT          NOT NULL DEFAULT 'NEEDS_REVIEW'
                        CHECK (balance_credit_status IN ('NEEDS_REVIEW', 'CREDITED', 'ALREADY_CREDITED', 'NOT_APPLICABLE')),
  reviewed_by           UUID,
  reviewed_at           TIMESTAMPTZ,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_lds_user_id      ON late_deposit_sweeps(user_id);
CREATE INDEX IF NOT EXISTS idx_lds_swept_status ON late_deposit_sweeps(swept_status);
CREATE INDEX IF NOT EXISTS idx_lds_credit_status ON late_deposit_sweeps(balance_credit_status);

ALTER TABLE late_deposit_sweeps ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'late_deposit_sweeps' AND policyname = 'Service role full access to late_deposit_sweeps'
  ) THEN
    CREATE POLICY "Service role full access to late_deposit_sweeps"
      ON late_deposit_sweeps FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 3. treasury_migration_transactions — the full audit ledger ────────────
-- One row per on-chain transaction that moves BTC as part of the migration
-- (test transaction, hot-wallet sweep, user-deposit sweeps, late-deposit
-- sweeps). Every field the migration plan's verification phase requires.
CREATE TABLE IF NOT EXISTS treasury_migration_transactions (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  phase                 TEXT          NOT NULL, -- e.g. 'TEST_TX', 'HOT_WALLET_MIGRATION', 'USER_DEPOSIT_SWEEP', 'LATE_DEPOSIT_SWEEP'
  source_address        TEXT          NOT NULL,
  destination_address   TEXT          NOT NULL,
  intended_amount_sats  BIGINT        NOT NULL,
  actual_amount_sats    BIGINT,       -- filled in once broadcast confirms
  fee_sats              BIGINT,
  txid                  TEXT,
  confirmation_status   TEXT          NOT NULL DEFAULT 'PENDING'
                        CHECK (confirmation_status IN ('PENDING', 'BROADCAST', 'CONFIRMED_1', 'CONFIRMED_3PLUS', 'FAILED')),
  user_id               UUID,         -- null for company-level transactions (hot wallet, treasury)
  reconciliation_status TEXT          NOT NULL DEFAULT 'PENDING'
                        CHECK (reconciliation_status IN ('PENDING', 'MATCHED', 'MISMATCH')),
  reconciliation_notes  TEXT,         -- required detail if reconciliation_status = 'MISMATCH' — this is the hard-stop record
  created_at            TIMESTAMPTZ   DEFAULT now(),
  confirmed_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tmt_phase        ON treasury_migration_transactions(phase);
CREATE INDEX IF NOT EXISTS idx_tmt_recon_status ON treasury_migration_transactions(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_tmt_user_id      ON treasury_migration_transactions(user_id);

ALTER TABLE treasury_migration_transactions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'treasury_migration_transactions' AND policyname = 'Service role full access to treasury_migration_transactions'
  ) THEN
    CREATE POLICY "Service role full access to treasury_migration_transactions"
      ON treasury_migration_transactions FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- Done. This file only defines tracking tables — it does not touch
-- wallets, user_wallets, users, or any balance. Safe to review and
-- run independently of the actual migration; running it does not
-- move funds, change addresses, or start monitoring by itself — it
-- only creates the tables the migration scripts will write to.
-- ============================================================
