-- Migration: Drop NOT NULL constraint on messages.sender_id to allow system messages
-- Run this in your Supabase SQL Editor:

ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL;
