const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { authenticateToken } = require('../middleware/auth');
const { feedbackLimiter } = require('../middleware/rateLimit');

router.post('/', authenticateToken, feedbackLimiter, feedbackController.submitFeedback);

module.exports = router;
