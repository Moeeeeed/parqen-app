-- ─────────────────────────────────────────────────────────────────────────────
-- Contacts table (minimal): who added whom. No nicknames/notes/groups.
-- Run in the Supabase SQL Editor of the CURRENT project (the one backend/.env
-- points at). Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists contacts (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references users(id) on delete cascade,
  contact_user_id uuid not null references users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  -- A user can add the same contact only once.
  unique (owner_user_id, contact_user_id),
  -- You cannot add yourself.
  check (owner_user_id <> contact_user_id)
);

-- The check lives in the API too, but this guards any direct writes.
alter table contacts enable row level security;

-- Permissive read: owner sees their own contacts. Writes go exclusively
-- through the service-role backend (no client-facing write policies on
-- purpose — this pass is API-only).
create policy "contacts_owner_read"
  on contacts for select
  using (auth.uid() = owner_user_id);

create index if not exists contacts_owner_idx on contacts (owner_user_id);
create index if not exists contacts_contact_idx on contacts (contact_user_id);
