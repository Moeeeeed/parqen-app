-- ============================================================
-- Two-Way Email Integration — support email ↔ ticket sync
-- Run this in Supabase SQL Editor (idempotent; safe to re-run)
-- 2026-09-11
--
-- Adds email-channel fields to the existing support ticket tables.
-- No existing columns are modified or dropped; additive only.
-- ============================================================

-- ── support_tickets ─────────────────────────────────────────
-- channel: where the ticket was created. 'chat' = in-app (default/backfill),
-- 'email' = created from an inbound support email. NULL = legacy chat ticket.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'chat';

-- inbound_email_ref: the provider Message-ID of the most recent inbound email
-- on this thread. Used to match In-Reply-To replies back to the right ticket.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS inbound_email_ref TEXT;

-- Form-based ticket creation (email-only flow): the Support form collects an
-- optional Trade/Reference ID and a department/priority. The backend falls
-- back gracefully if these are absent, but adding them keeps the data intact.
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS department         TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority           TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS trade_reference    TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS submitted_username TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS submitted_email    TEXT;

CREATE INDEX IF NOT EXISTS idx_support_tickets_inbound_ref ON support_tickets(inbound_email_ref);
CREATE INDEX IF NOT EXISTS idx_support_tickets_channel     ON support_tickets(channel);

-- ── support_messages ────────────────────────────────────────
-- channel: how this individual message arrived ('chat' | 'email').
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS channel TEXT;

-- user_email: the external sender address for messages that arrived via email
-- (needed for ghost-user tickets where the linked user row has no real identity).
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS user_email TEXT;

-- email_message_id: 'email:<provider Message-ID>' dedupe key — makes webhook
-- replays idempotent so a retried delivery never duplicates a message.
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS email_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_messages_email_message_id
  ON support_messages(email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_messages_channel ON support_messages(channel);

-- ── Backfill ────────────────────────────────────────────────
-- Existing tickets were all created in-app.
UPDATE support_tickets SET channel = 'chat' WHERE channel IS NULL;

-- ── RLS note ────────────────────────────────────────────────
-- The webhook writes with the service-role key, which bypasses RLS, so no new
-- policies are required. If any client selects these new columns through
-- anon/authenticated policies, existing SELECT policies on these tables apply
-- unchanged.
