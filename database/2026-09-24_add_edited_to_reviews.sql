-- ─────────────────────────────────────────────────────────────────────────────
-- Feedback edit support: one edit per review.
-- Run in the Supabase SQL Editor of the CURRENT project (backend/.env target).
-- Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table reviews add column if not exists edited boolean not null default false;
