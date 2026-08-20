-- Add avg_response_time to users table.
--
-- The trader card's "Avg. response" stat (frontend/src/pages/BuyBitcoin.js and
-- its Sell/USDT/GiftCard siblings) has always read u.avg_response_time /
-- u.avg_reply_minutes, but no such column ever existed on users — so every
-- trader's card always showed "-". This column is what backend/server.js
-- (POST /api/messages) now updates with a running average of how many minutes
-- after a trade opens the trader sends their first message in it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avg_response_time NUMERIC DEFAULT NULL;
