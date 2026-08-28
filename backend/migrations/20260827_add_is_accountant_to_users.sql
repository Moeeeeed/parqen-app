-- Adds a dedicated, read-only "Accountant" role — additive only, no drops, no data changes.
-- Mirrors how is_agent was added for the Agent Dashboard: a nullable boolean, default false,
-- so every existing row is unaffected until an admin explicitly grants it to someone.
--
-- Not run automatically — review and run this yourself in the Supabase SQL Editor when ready,
-- same convention as every other migration in this repo.
--
-- After running this, granting/revoking access is just:
--   UPDATE users SET is_accountant = true WHERE email = 'accountant@yourcompany.com';
-- (An Admin Panel toggle button, like the existing "Grant Support Access" one for agents,
-- would be a small separate follow-up if you want it self-service instead of SQL.)

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_accountant BOOLEAN DEFAULT false;
