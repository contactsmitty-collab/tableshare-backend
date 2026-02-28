const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { bioGenerateLimiter } = require('../middleware/rateLimit');

router.get('/me', authenticateToken, userController.getMyProfile);
router.put('/me', authenticateToken, userController.updateMyProfile);
router.get('/me/bio/generate', authenticateToken, bioGenerateLimiter, userController.generateAIBio);
router.get('/:userId', authenticateToken, userController.getUserById);

module.exports = router;
