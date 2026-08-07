-- Fix: total_trades and feedback counts were being incremented TWICE per event.
-- Cause: legacy triggers (on_trade_completed, on_review_created_update_feedback)
-- from schema.sql duplicate the work already done atomically by the backend's
-- praqen_increment_trades / praqen_add_feedback RPCs (see server.js updateUserTradeStats
-- and the /api/trades/:id/feedback route). Run this once in the Supabase SQL editor.

-- 1) Remove the duplicate triggers/functions — counts are now owned solely by the backend RPCs.
DROP TRIGGER IF EXISTS on_trade_completed ON trades;
DROP FUNCTION IF EXISTS trigger_update_trade_count();

DROP TRIGGER IF EXISTS on_review_created_update_feedback ON reviews;
DROP FUNCTION IF EXISTS trigger_update_feedback_counts();

-- 2) One-time correction: recompute every user's counters from the real source data
--    (trades / reviews tables), undoing the accumulated double-counting.
UPDATE users u
SET total_trades = COALESCE((
  SELECT COUNT(*) FROM trades t
  WHERE t.status = 'COMPLETED' AND (t.seller_id = u.id OR t.buyer_id = u.id)
), 0);

UPDATE users u
SET
  positive_feedback     = COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.reviewee_id = u.id AND r.rating >= 4), 0),
  negative_feedback     = COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.reviewee_id = u.id AND r.rating <= 2), 0),
  total_feedback_count  = COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.reviewee_id = u.id), 0),
  average_rating        = COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 2) FROM reviews r WHERE r.reviewee_id = u.id), 0);
