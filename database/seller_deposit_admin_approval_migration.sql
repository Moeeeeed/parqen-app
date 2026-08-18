-- PRAQEN — seller_deposits admin-approval step
-- Locking a deposit now lands in PENDING_APPROVAL (funds already moved out of the
-- wallet) instead of going straight to LOCKED. can_create_sell_listing only turns
-- true once an admin approves it (PENDING_APPROVAL -> LOCKED), or the deposit is
-- refunded on rejection (PENDING_APPROVAL -> REJECTED).
-- Run this once in the Supabase SQL Editor.

ALTER TABLE seller_deposits ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE seller_deposits ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;

-- status now: PENDING_APPROVAL | LOCKED | PENDING_WITHDRAWAL | WITHDRAWN | SEIZED | REJECTED

-- Widen the "one active deposit per user" guard to also cover the new pending-approval
-- state, so a user can't spam multiple lock attempts while awaiting admin review.
DROP INDEX IF EXISTS uq_seller_deposits_one_active_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_deposits_one_active_per_user
  ON seller_deposits(user_id) WHERE status IN ('PENDING_APPROVAL', 'LOCKED', 'PENDING_WITHDRAWAL');
