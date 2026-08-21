-- Agent chat availability status (separate from last_seen_at which is a heartbeat)
-- Agents toggle this manually; also auto-set to offline on long inactivity.
create table if not exists agent_chat_status (
  user_id uuid primary key references users(id) on delete cascade,
  is_online boolean default false,
  display_name text,            -- agent's display name in chat (customizable)
  avatar_url text,              -- agent's avatar for chat (customizable)
  status_message text default 'Available for live chat',
  last_toggled_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Typing indicator for support tickets (in-memory is fine but DB enables cross-tab sync)
-- We'll use in-memory like trades do. No migration needed for this.

-- RLS: agents manage their own status; users can read any agent's status
alter table agent_chat_status enable row level security;

-- Agents can read and update their own status
create policy "Agents manage own status" on agent_chat_status
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Anyone authenticated can read agent status (for availability check)
create policy "Authenticated read agent status" on agent_chat_status
  for select
  using (auth.role() = 'authenticated');
