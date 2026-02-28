const express = require('express');
const router = express.Router();
const pointsController = require('../controllers/pointsController');
const { authenticateToken } = require('../middleware/auth');

// Get user's points
router.get('/me', authenticateToken, pointsController.getMyPoints);

// Get point history
router.get('/history', authenticateToken, pointsController.getPointHistory);

// Get leaderboard
router.get('/leaderboard', authenticateToken, pointsController.getLeaderboard);

// Get user's rank
router.get('/rank', authenticateToken, pointsController.getMyRank);

module.exports = router;
