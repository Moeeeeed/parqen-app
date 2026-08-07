ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_password_token TEXT, ADD COLUMN IF NOT EXISTS reset_password_expires TIMESTAMPTZ;
