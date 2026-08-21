-- Add assigned_agent_id to support_tickets so agents can be assigned to tickets
-- This is needed for the "Talk to a Human" feature
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_agent_id uuid REFERENCES users(id);

-- Index for querying tickets by assigned agent
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_agent ON support_tickets(assigned_agent_id);
