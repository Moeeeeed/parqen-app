-- add_release_columns.sql
-- Adds release_tx_hash and buyer_received_btc to the trades table.
-- These columns are referenced by tradeEscrowService.releaseBitcoinToBuyer()
-- but were never added via migration — causing the status update to COMPLETED
-- to silently fail (PostgreSQL rolls back the entire UPDATE when a column
-- doesn't exist, so status never changes from PAYMENT_SENT to COMPLETED).
--
-- Run once in Supabase SQL Editor.

ALTER TABLE trades ADD COLUMN IF NOT EXISTS release_tx_hash   VARCHAR(255) DEFAULT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS buyer_received_btc DECIMAL(18,8) DEFAULT NULL;
