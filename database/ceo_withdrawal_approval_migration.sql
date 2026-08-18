-- PRAQEN — CEO manual-approval gate for external BTC withdrawals
-- Every send-to-external-wallet now lands in wallet_transactions as
-- status='PENDING_APPROVAL' (funds already deducted from the user's balance)
-- instead of broadcasting immediately. Only a CEO-flagged account can push it
-- on-chain (approve) or return the funds to the user (reject).
-- Run this once in the Supabase SQL Editor.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ceo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS platform_fee_btc DECIMAL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reviewed_by       UUID REFERENCES users(id);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS reviewed_at       TIMESTAMPTZ;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;

-- status now additionally includes: PENDING_APPROVAL | REJECTED
-- (existing values PENDING | CONFIRMED | FAILED are untouched)

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_pending_approval
  ON wallet_transactions(created_at) WHERE status = 'PENDING_APPROVAL';

-- ── One-time setup: flag your own account as CEO so you can access the ──────
-- CEO Approvals page. Replace the email below and run separately.
-- UPDATE users SET is_ceo = true WHERE email = 'you@praqen.com';
