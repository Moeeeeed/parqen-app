-- Add is_agent boolean to users table for dedicated support agent role
-- Agents can use the Agent Dashboard without needing is_admin or is_moderator
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agent boolean DEFAULT false;

-- Index for quickly finding agent users
CREATE INDEX IF NOT EXISTS idx_users_is_agent ON users(is_agent) WHERE is_agent = true;
-- Add department/category column to support_tickets
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS department text DEFAULT 'general';

-- Index for filtering by department
CREATE INDEX IF NOT EXISTS idx_support_tickets_department ON support_tickets(department);
-- Add assigned_agent_id to support_tickets so agents can be assigned to tickets
-- This is needed for the "Talk to a Human" feature
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_agent_id uuid REFERENCES users(id);

-- Index for querying tickets by assigned agent
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_agent ON support_tickets(assigned_agent_id);
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
-- ============================================================
-- Migration: AI Chat RAG Pipeline Tables
-- Date: 2026-08-21
-- Adds: kb_articles, ai_chat_sessions, ai_chat_messages
-- ============================================================

-- Enable pgvector for embedding similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Knowledge Base Articles ──────────────────────────────────
-- Editable by support team, source of truth for AI chat answers.
-- Each row = one FAQ/article that can be retrieved by semantic similarity.
CREATE TABLE IF NOT EXISTS kb_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT,                          -- 'buy','sell','trade','payment','account','wallet','kyc','other', null for general
  title TEXT NOT NULL,                 -- Short heading for the article
  content TEXT NOT NULL,               -- Full article text (plain or markdown)
  embedding VECTOR(1024),             -- Mistral mistral-embed dimension
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- IVFFlat index for fast cosine similarity search
-- Note: IVFFlat requires at least a few hundred rows to be useful.
-- After seeding, run: REINDEX INDEX kb_articles_embedding_idx;
CREATE INDEX IF NOT EXISTS kb_articles_embedding_idx
  ON kb_articles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Index on topic for filtered queries
CREATE INDEX IF NOT EXISTS kb_articles_topic_idx ON kb_articles (topic);

-- ── AI Chat Sessions ─────────────────────────────────────────
-- Groups a conversation (support or general mode) together.
-- Separate from support_tickets — standalone AI chat has its own sessions.
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_id UUID,                     -- nullable: links to a support ticket if in ticket-chat context
  mode TEXT CHECK (mode IN ('support', 'general')) NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── AI Chat Messages ─────────────────────────────────────────
-- Individual messages within a session, with AI confidence and escalation flags.
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES ai_chat_sessions(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('user', 'ai')) NOT NULL,
  content TEXT NOT NULL,
  confidence NUMERIC,                 -- 0–1, how confident the AI was in its answer
  escalated BOOLEAN DEFAULT FALSE,    -- true if the AI suggested escalation
  suggested_priority TEXT CHECK (suggested_priority IN ('low', 'normal', 'urgent')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_chat_messages_session_idx ON ai_chat_messages (session_id, created_at);

-- ── Row Level Security ───────────────────────────────────────
-- kb_articles: publicly readable by authenticated users, only writable by support_admin
ALTER TABLE kb_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kb_articles_select_authenticated"
  ON kb_articles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "kb_articles_insert_admin"
  ON kb_articles FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (is_admin = true OR is_moderator = true))
  );

CREATE POLICY "kb_articles_update_admin"
  ON kb_articles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND (is_admin = true OR is_moderator = true))
  );

CREATE POLICY "kb_articles_delete_admin"
  ON kb_articles FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true)
  );

-- ai_chat_sessions: users can only read/write their own sessions
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_chat_sessions_select_own"
  ON ai_chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "ai_chat_sessions_insert_own"
  ON ai_chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ai_chat_messages: users can only read messages from their own sessions
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_chat_messages_select_own"
  ON ai_chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ai_chat_sessions
      WHERE ai_chat_sessions.id = ai_chat_messages.session_id
      AND ai_chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "ai_chat_messages_insert_own"
  ON ai_chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_chat_sessions
      WHERE ai_chat_sessions.id = ai_chat_messages.session_id
      AND ai_chat_sessions.user_id = auth.uid()
    )
  );

-- ── Update trigger for kb_articles ───────────────────────────
CREATE OR REPLACE FUNCTION update_kb_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kb_articles_updated_at
  BEFORE UPDATE ON kb_articles
  FOR EACH ROW
  EXECUTE FUNCTION update_kb_articles_updated_at();
-- Add amount_receive_usd column to trades table.
-- This stores the fiat-equivalent value of the BTC at the MARKET rate at trade
-- creation time, which differs from amount_usd (the payment amount) whenever
-- the seller has a margin.
--
-- Example: buyer pays $25, seller has +5% margin.
--   amount_usd        = $25.00  (what the buyer pays)
--   amount_btc        = 0.00039683 BTC (at $63k seller rate)
--   amount_receive_usd = $23.81  (0.00039683 × $60k market rate — the true receive value)

ALTER TABLE trades ADD COLUMN IF NOT EXISTS amount_receive_usd DECIMAL DEFAULT NULL;
