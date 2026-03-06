-- Subscription (RevenueCat / paywall): premium_until and source for GET /users/me and webhook updates.
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_source VARCHAR(50);
COMMENT ON COLUMN users.premium_until IS 'Premium access until this time (set by RevenueCat webhook or rewards)';
COMMENT ON COLUMN users.subscription_source IS 'Source: iap (RevenueCat), points, etc.';
