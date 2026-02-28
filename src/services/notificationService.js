const admin = require('firebase-admin');
const db = require('../config/database');
const logger = require('../utils/logger');

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

const initializeFirebase = () => {
  if (firebaseInitialized) return;

  try {
    // Check if service account key exists
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      logger.info('Firebase Admin SDK initialized');
    } else {
      logger.warn('Firebase service account not configured - push notifications disabled');
    }
  } catch (error) {
    logger.error('Failed to initialize Firebase:', error);
  }
};

// Initialize on module load
initializeFirebase();

const notificationService = {
  // Register a device token for a user
  async registerDevice(userId, token, platform) {
    try {
      // Check if token already exists
      const existing = await db.query(
        'SELECT * FROM device_tokens WHERE token = $1',
        [token]
      );

      if (existing.rows.length > 0) {
        // Update existing token with new user
        await db.query(
          'UPDATE device_tokens SET user_id = $1, platform = $2, updated_at = NOW() WHERE token = $3',
          [userId, platform, token]
        );
      } else {
        // Insert new token
        await db.query(
          'INSERT INTO device_tokens (user_id, token, platform) VALUES ($1, $2, $3)',
          [userId, token, platform]
        );
      }

      logger.info(`Device registered for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error registering device:', error);
      throw error;
    }
  },

  // Unregister a device token
  async unregisterDevice(token) {
    try {
      await db.query('DELETE FROM device_tokens WHERE token = $1', [token]);
      logger.info('Device unregistered');
      return true;
    } catch (error) {
      logger.error('Error unregistering device:', error);
      throw error;
    }
  },

  // Get all device tokens for a user
  async getUserTokens(userId) {
    try {
      const result = await db.query(
        'SELECT token, platform FROM device_tokens WHERE user_id = $1',
        [userId]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting user tokens:', error);
      return [];
    }
  },

  // Send notification to a specific user
  async sendToUser(userId, title, body, data = {}) {
    if (!firebaseInitialized) {
      logger.warn('Firebase not initialized - skipping notification');
      return false;
    }

    try {
      const tokens = await this.getUserTokens(userId);

      if (tokens.length === 0) {
        logger.info(`No device tokens for user ${userId}`);
        return false;
      }

      const message = {
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        tokens: tokens.map((t) => t.token),
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      logger.info(`Notification sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failures`);

      // Remove invalid tokens
      if (response.failureCount > 0) {
        const tokensToRemove = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              tokensToRemove.push(tokens[idx].token);
            }
          }
        });

        // Remove invalid tokens from database
        for (const token of tokensToRemove) {
          await this.unregisterDevice(token);
        }
      }

      return response.successCount > 0;
    } catch (error) {
      logger.error('Error sending notification:', error);
      return false;
    }
  },

  // Send new match notification
  async sendMatchNotification(userId, matchedUserName, restaurantName) {
    return this.sendToUser(
      userId,
      'New Match!',
      `You matched with ${matchedUserName} at ${restaurantName}`,
      { type: 'match', screen: 'Matches' }
    );
  },

  // Send new message notification
  async sendMessageNotification(userId, senderName, messagePreview) {
    const preview = messagePreview.length > 50
      ? messagePreview.substring(0, 47) + '...'
      : messagePreview;

    return this.sendToUser(
      userId,
      `New message from ${senderName}`,
      preview,
      { type: 'message', screen: 'Messages' }
    );
  },

  // Send check-in nearby notification
  async sendNearbyCheckInNotification(userId, userName, restaurantName) {
    return this.sendToUser(
      userId,
      'Someone is dining nearby!',
      `${userName} just checked in at ${restaurantName}`,
      { type: 'checkin', screen: 'Home' }
    );
  },

  // Send reservation confirmation (right after booking)
  async sendReservationConfirmation(userId, restaurantName, reservationDate, reservationTime, partySize, confirmationCode) {
    const timeStr = typeof reservationTime === 'string' ? reservationTime.slice(0, 5) : String(reservationTime).slice(0, 5);
    return this.sendToUser(
      userId,
      'Reservation confirmed!',
      `Your table at ${restaurantName} for ${partySize} on ${reservationDate} at ${timeStr}. Code: ${confirmationCode || '—'}`,
      { type: 'reservation_confirmation', screen: 'Reservations' }
    );
  },

  // Send reservation reminder (24h or 1h before)
  async sendReservationReminder(userId, restaurantName, reservationDate, reservationTime, reservationId, hoursAhead) {
    const timeStr = typeof reservationTime === 'string' ? reservationTime.slice(0, 5) : String(reservationTime).slice(0, 5);
    const when = hoursAhead === 1 ? 'in 1 hour' : 'tomorrow';
    return this.sendToUser(
      userId,
      'Reminder: Your reservation',
      `Your table at ${restaurantName} is ${when} at ${timeStr}.`,
      { type: 'reservation_reminder', screen: 'Reservations', reservationId: String(reservationId) }
    );
  },
};

module.exports = notificationService;
