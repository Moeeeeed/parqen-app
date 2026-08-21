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
