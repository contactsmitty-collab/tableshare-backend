/**
 * Loyalty Routes
 * Venue Loyalty Points Program API endpoints
 */

const express = require('express');
const router = express.Router();
const loyaltyController = require('../controllers/loyaltyController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * @route GET /api/v1/loyalty/programs
 * @desc Get all active loyalty programs (discovery)
 * @query latitude, longitude, radius (optional - for nearby programs)
 * @access Private
 */
router.get('/programs', loyaltyController.getAllLoyaltyPrograms);

/**
 * @route GET /api/v1/loyalty/my-programs
 * @desc Get user's joined loyalty programs with points and tier status
 * @access Private
 */
router.get('/my-programs', loyaltyController.getMyLoyaltyPrograms);

/**
 * @route GET /api/v1/loyalty/venue/:restaurantId
 * @desc Get detailed loyalty status for a specific venue
 * @access Private
 */
router.get('/venue/:restaurantId', loyaltyController.getVenueLoyaltyStatus);

/**
 * @route POST /api/v1/loyalty/venue/:restaurantId/join
 * @desc Join a loyalty program (awards welcome bonus)
 * @access Private
 */
router.post('/venue/:restaurantId/join', loyaltyController.joinLoyaltyProgram);

/**
 * @route POST /api/v1/loyalty/venue/:restaurantId/redeem
 * @desc Redeem points for a reward
 * @body points_to_redeem, reward_description
 * @access Private
 */
router.post('/venue/:restaurantId/redeem', loyaltyController.redeemPoints);

/**
 * @route GET /api/v1/loyalty/venue/:restaurantId/leaderboard
 * @desc Get loyalty leaderboard for a venue
 * @query limit (default: 10)
 * @access Private
 */
router.get('/venue/:restaurantId/leaderboard', loyaltyController.getVenueLoyaltyLeaderboard);

/**
 * @route POST /api/v1/loyalty/award/:restaurantId/:userId
 * @desc Award points manually (staff/admin only)
 * @body points, description, transaction_type
 * @access Private (Staff/Admin)
 */
router.post('/award/:restaurantId/:userId', loyaltyController.awardPointsManual);

/**
 * @route POST /api/v1/loyalty/program/:restaurantId
 * @desc Create or update loyalty program (restaurant owner/manager)
 * @body program settings
 * @access Private (Restaurant Admin)
 */
router.post('/program/:restaurantId', loyaltyController.createLoyaltyProgram);

module.exports = router;
