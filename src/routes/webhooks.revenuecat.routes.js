/**
 * RevenueCat webhook: POST /api/v1/webhooks/revenuecat
 * Configure this URL in RevenueCat dashboard. No auth; verify with shared secret.
 * Env: REVENUECAT_WEBHOOK_AUTHORIZATION or REVENUECAT_WEBHOOK_SECRET
 */
const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

const REVENUECAT_SECRET = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION || process.env.REVENUECAT_WEBHOOK_SECRET;

function updatePremiumFromRevenueCat(appUserId, event) {
  const eventType = (event.type || event.event?.type || '').toUpperCase();
  const expirationMs = event.expiration_at_ms ?? event.event?.expiration_at_ms;

  if (['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION'].includes(eventType) && expirationMs) {
    const premiumUntil = new Date(Number(expirationMs));
    return query(
      'UPDATE users SET premium_until = $2, subscription_source = $3 WHERE user_id = $1',
      [appUserId, premiumUntil.toISOString(), 'iap']
    );
  }

  if (['CANCELLATION', 'EXPIRATION'].includes(eventType)) {
    if (expirationMs) {
      const premiumUntil = new Date(Number(expirationMs));
      return query(
        'UPDATE users SET premium_until = $2, subscription_source = $3 WHERE user_id = $1',
        [appUserId, premiumUntil.toISOString(), 'iap']
      );
    }
    return query(
      'UPDATE users SET premium_until = NULL, subscription_source = NULL WHERE user_id = $1',
      [appUserId]
    );
  }
  return Promise.resolve();
}

router.post('/', express.json({ type: 'application/json' }), async (req, res) => {
  try {
    if (REVENUECAT_SECRET) {
      const auth = req.headers.authorization || req.headers['x-revenuecat-authorization'];
      const token = auth && (auth.startsWith('Bearer ') ? auth.slice(7) : auth);
      if (token !== REVENUECAT_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const body = req.body || {};
    const event = body.event || body;
    const appUserId = event.app_user_id || event.original_app_user_id || body.app_user_id;
    if (!appUserId) {
      return res.status(400).json({ error: 'Missing app_user_id' });
    }

    await updatePremiumFromRevenueCat(appUserId, event);
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('RevenueCat webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
