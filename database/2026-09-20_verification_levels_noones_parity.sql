-- ─────────────────────────────────────────────────────────────────────────────
-- Account Settings → Verification tab: NoOnes-parity level flags
-- Structure (3 levels): 0 Email verification → 1 ID verification (includes
-- name + DOB confirmation) → 2 Proof of address verification.
-- 1. identity_basics_verified (BOOLEAN, DEFAULT FALSE) — INTERNAL sub-flag of
--    Level 1: set automatically by POST /api/kyc/upload when the ID
--    verification form (name + DOB + documents) is submitted. Kept for
--    backward compatibility with the backfill below; not a separate level.
-- 2. date_of_birth (DATE, NULL) — the DOB confirmed in the ID verification form.
-- 3. address_verified (BOOLEAN, DEFAULT FALSE) — Level 2 "Proof of address
--    verification" (available upon request after ID verification).
-- 4. Step-1 detail fields of the ID verification modal ("Your details" step):
--    id_document_number, postal_code, address. (country / city already exist
--    via database/admin_columns.sql; full_name exists in the base schema.)
-- 5. Backfill: anyone already fully KYC-verified has implicitly confirmed
--    their name + DOB, so their internal sub-flag is set too.
--
-- All GET/POST code paths read these columns defensively (isolated per-flag
-- queries / explicit 42703 handling), so a database that has not run this
-- migration degrades to `false` or a clear error instead of silently dropping
-- data (silent-column-drop lesson).
--
-- Run once in Supabase (SQL Editor) or via `node run-sql.js`.
-- ─────────────────────────────────────────────────────────────────────────────

-- Level 1 — Identity basics sub-flag of ID verification (internal)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS identity_basics_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Date of birth confirmed in the ID verification form
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Level 2 — Proof of address verification
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS address_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- ID verification modal — "Your details" step fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS id_document_number VARCHAR(100);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Backfill: fully KYC-verified users have already confirmed name + DOB as part
-- of ID verification — unlock their Level 1 so the sequential progression
-- reflects reality.
-- NOTE: there is NO kyc_verified column on users — that name only exists as an
-- API response alias. The real columns are is_id_verified (base schema) and
-- kyc_status (database/admin_columns.sql). The DO block below guards on both
-- so this file also runs cleanly on databases where admin_columns.sql hasn't
-- been applied yet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_id_verified')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'kyc_status') THEN
    UPDATE users
    SET identity_basics_verified = TRUE
    WHERE identity_basics_verified = FALSE
      AND (is_id_verified IS TRUE OR kyc_status = 'approved');
  ELSE
    RAISE NOTICE 'Backfill skipped — run database/admin_columns.sql first (is_id_verified / kyc_status missing on users)';
  END IF;
END $$;
