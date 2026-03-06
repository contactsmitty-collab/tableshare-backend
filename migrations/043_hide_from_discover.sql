-- Hide from Discover: users can opt out of appearing in Discover / match queries.
-- In Discover and "find matches" queries, exclude users where hide_from_discover = true.
-- PATCH /users/me should accept { hide_from_discover: boolean } and persist.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'hide_from_discover') THEN
    ALTER TABLE users ADD COLUMN hide_from_discover BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN users.hide_from_discover IS 'When true, exclude this user from Discover and match-finding queries.';
