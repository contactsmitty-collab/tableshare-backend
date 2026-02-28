const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

// Register device for push notifications
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const { token, platform } = req.body;
    const userId = req.user.userId;

    if (!token) {
      return res.status(400).json({ error: 'Device token is required' });
    }

    await notificationService.registerDevice(userId, token, platform || 'ios');

    res.json({ success: true, message: 'Device registered for notifications' });
  } catch (error) {
    console.error('Error registering device:', error);
    if (error.message === 'User not found') {
      return res.status(401).json({ error: 'User not found. Please log in again.' });
    }
    res.status(500).json({ error: 'Failed to register device' });
  }
});

// Unregister device
router.post('/unregister', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Device token is required' });
    }

    await notificationService.unregisterDevice(token);

    res.json({ success: true, message: 'Device unregistered' });
  } catch (error) {
    console.error('Error unregistering device:', error);
    res.status(500).json({ error: 'Failed to unregister device' });
  }
});

// Test notification (for development)
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, body } = req.body;

    const success = await notificationService.sendToUser(
      userId,
      title || 'Test Notification',
      body || 'This is a test notification from TableShare!'
    );

    if (success) {
      res.json({ success: true, message: 'Test notification sent' });
    } else {
      res.json({ success: false, message: 'No registered devices or notification failed' });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;
