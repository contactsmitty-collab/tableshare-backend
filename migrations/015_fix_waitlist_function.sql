-- Fix missing waitlist function
CREATE OR REPLACE FUNCTION expire_old_waitlist_entries()
RETURNS void AS $$
BEGIN
    UPDATE waitlist_entries
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancellation_reason = 'expired'
    WHERE status IN ('waiting', 'notified')
    AND joined_at < NOW() - INTERVAL '4 hours';
END;
$$ LANGUAGE plpgsql;
