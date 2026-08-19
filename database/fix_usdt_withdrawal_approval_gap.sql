-- PRAQEN — close the USDT withdrawal security gap
--
-- BTC withdrawals already require CEO approval before anything broadcasts
-- (see ceo_withdrawal_approval_migration.sql). USDT withdrawals never got the
-- same treatment: POST /api/wallet/usdt/send deducted the user's balance and
-- broadcast on-chain in the same request, with zero human review. This let a
-- compromised/scammer-controlled account drain USDT instantly while the BTC
-- path was properly gated. The app code has been changed to hold USDT sends
-- as PENDING_APPROVAL the same way BTC does — this migration adds the one
-- column that path needs and didn't have yet.
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS platform_fee_usdt DECIMAL(18,6);
