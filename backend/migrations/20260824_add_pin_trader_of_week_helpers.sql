-- Lets an admin manually pin (or release) a trader-of-week badge slot to a
-- specific user by username alone — no need to hand-look-up user_id/listing_id
-- in the Supabase table editor every time.
--
-- Usage:
--   SELECT pin_trader_of_week('ColdStunna', 'sell_bitcoin:KE');
--   SELECT pin_trader_of_week('KEN IGHO', 'buy_bitcoin:GH');
--   SELECT pin_trader_of_week('ukbuyer2022', 'gift_card');
--   SELECT unpin_trader_of_week('sell_bitcoin:KE');  -- release back to auto-rotation
--
-- category must be 'gift_card' or '{buy_bitcoin|sell_bitcoin}:{2-letter country code}'
-- (matches the categories services/traderOfWeekService.js computes). Pinning a
-- category makes traderOfWeekService.js skip it on the next rotation and also
-- reserves that user_id so they can't simultaneously win any OTHER category —
-- same "one badge per user" rule the auto-rotation enforces for itself.

CREATE OR REPLACE FUNCTION pin_trader_of_week(p_username text, p_category text)
RETURNS trader_of_week
LANGUAGE plpgsql
AS $$
DECLARE
  v_user RECORD;
  v_listing RECORD;
  v_country text;
  v_row trader_of_week;
BEGIN
  SELECT id, username, total_trades, average_rating
    INTO v_user
    FROM users
    WHERE username ILIKE p_username
    LIMIT 1;

  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'No user found with username %', p_username;
  END IF;

  v_country := NULLIF(split_part(p_category, ':', 2), '');

  IF p_category = 'gift_card' THEN
    SELECT id, country INTO v_listing
      FROM listings
      WHERE seller_id = v_user.id
        AND status = 'ACTIVE'
        AND listing_type IN ('BUY_GIFT_CARD', 'SELL_GIFT_CARD')
      ORDER BY created_at DESC
      LIMIT 1;
  ELSIF p_category LIKE 'buy_bitcoin:%' THEN
    SELECT id, country INTO v_listing
      FROM listings
      WHERE seller_id = v_user.id
        AND status = 'ACTIVE'
        AND asset = 'BTC'
        AND listing_type IN ('SELL', 'SELL_BITCOIN')
        AND upper(country) = upper(v_country)
      ORDER BY created_at DESC
      LIMIT 1;
  ELSIF p_category LIKE 'sell_bitcoin:%' THEN
    SELECT id, country INTO v_listing
      FROM listings
      WHERE seller_id = v_user.id
        AND status = 'ACTIVE'
        AND asset = 'BTC'
        AND listing_type IN ('BUY', 'BUY_BITCOIN')
        AND upper(country) = upper(v_country)
      ORDER BY created_at DESC
      LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Unknown category %. Use ''gift_card'', ''buy_bitcoin:CC'', or ''sell_bitcoin:CC''.', p_category;
  END IF;

  IF v_listing.id IS NULL THEN
    RAISE EXCEPTION '% has no ACTIVE listing matching category %', p_username, p_category;
  END IF;

  INSERT INTO trader_of_week
    (category, user_id, username, listing_id, total_trades, average_rating, country, selected_at, next_rotation_at, pinned)
  VALUES
    (p_category, v_user.id, v_user.username, v_listing.id, v_user.total_trades, v_user.average_rating,
     v_listing.country, now(), now() + interval '7 days', true)
  ON CONFLICT (category) DO UPDATE
    SET user_id          = EXCLUDED.user_id,
        username         = EXCLUDED.username,
        listing_id       = EXCLUDED.listing_id,
        total_trades     = EXCLUDED.total_trades,
        average_rating   = EXCLUDED.average_rating,
        country          = EXCLUDED.country,
        selected_at      = EXCLUDED.selected_at,
        next_rotation_at = EXCLUDED.next_rotation_at,
        pinned           = true
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION unpin_trader_of_week(p_category text)
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM trader_of_week WHERE category = p_category AND pinned = true;
$$;
