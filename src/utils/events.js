/**
 * Basic event logging for key product actions. Logs structured JSON to stdout.
 * To add Sentry: npm install @sentry/node, init in server.js, and in logEvent() add:
 *   if (global.Sentry) global.Sentry.captureMessage(name, { extra: props });
 */

const logger = require('./logger');

function logEvent(name, props = {}) {
  const payload = { event: name, ...props, ts: new Date().toISOString() };
  logger.info('event', payload);
}

const events = {
  reservation_created: (userId, restaurantId, reservationId, partySize) =>
    logEvent('reservation_created', { userId, restaurantId, reservationId, partySize }),

  reservation_cancelled: (userId, reservationId) =>
    logEvent('reservation_cancelled', { userId, reservationId }),

  login: (userId, success = true) =>
    logEvent('login', { userId, success }),

  signup: (userId) =>
    logEvent('signup', { userId }),

  match_requested: (requesterId, receiverId, matchId) =>
    logEvent('match_requested', { requesterId, receiverId, matchId }),

  check_in_created: (userId, restaurantId, checkInId) =>
    logEvent('check_in_created', { userId, restaurantId, checkInId }),
};

module.exports = { events, logEvent };
