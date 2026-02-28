-- One-time cleanup: remove duplicate active waitlist entries (keep oldest per user/restaurant).
-- Fixes "unique_active_waitlist" violations from legacy data or race conditions.

DELETE FROM waitlist_entries
WHERE waitlist_id IN (
  SELECT waitlist_id FROM (
    SELECT waitlist_id,
           ROW_NUMBER() OVER (PARTITION BY restaurant_id, user_id ORDER BY joined_at ASC) AS rn
    FROM waitlist_entries
    WHERE status IN ('waiting', 'notified')
  ) sub
  WHERE rn > 1
);
