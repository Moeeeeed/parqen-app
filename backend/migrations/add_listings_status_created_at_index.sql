-- The /api/listings marketplace endpoint runs:
--   WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 200
-- The existing idx_listings_status index only covers the WHERE clause, so Postgres
-- still has to sort every matching row by created_at after filtering. This composite
-- index lets it satisfy the filter, order, and limit directly from the index.
-- Safe to run on the live DB — CONCURRENTLY avoids locking the table during creation.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_listings_status_created_at
  ON listings (status, created_at DESC);
