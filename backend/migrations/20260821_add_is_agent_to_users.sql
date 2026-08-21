-- Add is_agent boolean to users table for dedicated support agent role
-- Agents can use the Agent Dashboard without needing is_admin or is_moderator
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agent boolean DEFAULT false;

-- Index for quickly finding agent users
CREATE INDEX IF NOT EXISTS idx_users_is_agent ON users(is_agent) WHERE is_agent = true;
