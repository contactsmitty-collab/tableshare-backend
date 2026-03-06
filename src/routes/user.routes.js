const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const blockController = require('../controllers/blockController');
const upcomingController = require('../controllers/upcomingController');
const { authenticateToken } = require('../middleware/auth');
const { bioGenerateLimiter } = require('../middleware/rateLimit');

router.get('/me', authenticateToken, userController.getMyProfile);
router.put('/me', authenticateToken, userController.updateMyProfile);
router.get('/me/notification-preferences', authenticateToken, userController.getNotificationPreferences);
router.patch('/me/notification-preferences', authenticateToken, userController.updateNotificationPreferences);
router.get('/me/blocked', authenticateToken, blockController.getBlockedUsers);
router.get('/me/upcoming', authenticateToken, upcomingController.getUpcoming);
router.post('/me/recent-restaurants', authenticateToken, userController.recordRecentRestaurant);
router.get('/me/recent-restaurants', authenticateToken, userController.getRecentRestaurants);
router.get('/me/onboarding-status', authenticateToken, userController.getOnboardingStatus);
router.get('/me/dining-stats', authenticateToken, userController.getDiningStats);
router.get('/me/activity-preferences', authenticateToken, userController.getActivityPreferences);
router.patch('/me/activity-preferences', authenticateToken, userController.updateActivityPreferences);
router.get('/me/bio/generate', authenticateToken, bioGenerateLimiter, userController.generateAIBio);
router.post('/:userId/block', authenticateToken, blockController.blockUser);
router.delete('/:userId/block', authenticateToken, blockController.unblockUser);
router.get('/:userId', authenticateToken, userController.getUserById);

module.exports = router;
