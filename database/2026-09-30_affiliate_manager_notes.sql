-- ─────────────────────────────────────────────────────────────────────────────
-- Affiliate Program Manager Portal — free-text follow-up notes.
--
-- Lets the manager drop a quick note ("this user is doing well, let's follow
-- up") and save it, optionally tagged to a specific affiliate's username.
-- regarding_username is plain text, not a foreign key — the manager may
-- reference a username loosely, or leave it blank for a general note. This
-- keeps the feature simple (no user-picker/autocomplete needed) and it never
-- breaks if a referenced account is later renamed or deleted.
--
-- Purely additive, own table, touches nothing else. Same "zero-migration
-- bootstrap" pattern as is_affiliate_manager — the backend degrades to an
-- empty list if this hasn't been run yet, so nothing crashes either way, but
-- it needs to be run for the Notes section to actually save anything.
--
-- Run once in Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_manager_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id           UUID NOT NULL REFERENCES users(id),
  regarding_username  VARCHAR(50),
  note                TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_manager_notes_created_at ON affiliate_manager_notes(created_at DESC);
