-- Fix unique_active_waitlist: allow only one *active* entry per user per restaurant.
-- Previously UNIQUE(restaurant_id, user_id, status) blocked multiple 'cancelled' rows,
-- so expire_old_waitlist_entries() could violate when updating to 'cancelled'.

ALTER TABLE waitlist_entries DROP CONSTRAINT IF EXISTS unique_active_waitlist;

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_waitlist
  ON waitlist_entries (restaurant_id, user_id)
  WHERE status IN ('waiting', 'notified');
