-- Migration: Add Telegram notification fields to users table
-- Run this in Supabase SQL Editor or via migration tool

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS telegram_connected_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN DEFAULT FALSE;

-- Index for fast lookup when the bot receives a message and needs to find the user
-- (chat_id lookups are infrequent, but good to have)
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
