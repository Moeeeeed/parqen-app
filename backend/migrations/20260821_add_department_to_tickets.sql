-- Add department/category column to support_tickets
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS department text DEFAULT 'general';

-- Index for filtering by department
CREATE INDEX IF NOT EXISTS idx_support_tickets_department ON support_tickets(department);
