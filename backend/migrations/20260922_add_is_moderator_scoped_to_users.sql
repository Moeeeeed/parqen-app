-- Adds a narrow, moderator-page-only permission — additive only, no drops, no data changes.
-- Distinct from is_moderator (which is treated as sufficient for Team Portal, the general
-- Admin Dashboard, and Agent Dashboard access across server.js). is_moderator_scoped is
-- wired into ONLY the handful of endpoints ModeratorDashboard.js itself needs to function
-- (dispute list/detail/resolve/comments, dispute-history, oath sign/status, team/moderators
-- list, trade moderator-join) — it is deliberately left out of requireAdmin() and every
-- other staff-surface check, so granting it never unlocks anything beyond /moderator.
--
-- Not run automatically — review and run this yourself in the Supabase SQL Editor when ready,
-- same convention as every other migration in this repo.
--
-- After running this, granting/revoking access is just:
--   UPDATE users SET is_moderator_scoped = true WHERE email = 'someone@example.com';

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_moderator_scoped BOOLEAN DEFAULT false;
