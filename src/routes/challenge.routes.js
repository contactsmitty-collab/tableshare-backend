/**
 * Challenge Routes
 * Social Challenges System API endpoints
 */

const express = require('express');
const router = express.Router();
const challengeController = require('../controllers/challengeController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * @route GET /api/v1/challenges
 * @desc Get all active challenges
 * @query scope (optional), city (optional)
 * @access Private
 */
router.get('/', challengeController.getActiveChallenges);

/**
 * @route GET /api/v1/challenges/templates
 * @desc Get challenge templates for creating new challenges
 * @access Private
 */
router.get('/templates', challengeController.getChallengeTemplates);

/**
 * @route GET /api/v1/challenges/my
 * @desc Get user's challenges (active and completed) with stats
 * @access Private
 */
router.get('/my', challengeController.getMyChallenges);

/**
 * @route GET /api/v1/challenges/invitations
 * @desc Get pending challenge invitations
 * @access Private
 */
router.get('/invitations', challengeController.getMyInvitations);

/**
 * @route GET /api/v1/challenges/:challengeId
 * @desc Get challenge details with leaderboard
 * @access Private
 */
router.get('/:challengeId', challengeController.getChallengeDetails);

/**
 * @route POST /api/v1/challenges
 * @desc Create a new challenge (admin/venue owner)
 * @access Private (Admin/Restaurant Owner)
 */
router.post('/', challengeController.createChallenge);

/**
 * @route POST /api/v1/challenges/:challengeId/join
 * @desc Join a challenge
 * @access Private
 */
router.post('/:challengeId/join', challengeController.joinChallenge);

/**
 * @route POST /api/v1/challenges/:challengeId/leave
 * @desc Leave/withdraw from a challenge
 * @access Private
 */
router.post('/:challengeId/leave', challengeController.leaveChallenge);

/**
 * @route POST /api/v1/challenges/:challengeId/invite
 * @desc Invite a friend to a challenge
 * @body invited_user_id, message (optional)
 * @access Private
 */
router.post('/:challengeId/invite', challengeController.inviteToChallenge);

/**
 * @route POST /api/v1/challenges/invitations/:invitationId/respond
 * @desc Accept or decline a challenge invitation
 * @body accept (boolean)
 * @access Private
 */
router.post('/invitations/:invitationId/respond', challengeController.respondToInvitation);

module.exports = router;
