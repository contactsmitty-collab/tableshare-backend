const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const dinnerInvitationsController = require('../controllers/dinnerInvitationsController');

router.post('/', authenticateToken, dinnerInvitationsController.sendInvitation);
router.get('/received', authenticateToken, dinnerInvitationsController.getReceivedInvitations);
router.get('/sent', authenticateToken, dinnerInvitationsController.getSentInvitations);
router.get('/confirmed', authenticateToken, dinnerInvitationsController.getConfirmedDinners);
router.post('/:invitationId/accept', authenticateToken, dinnerInvitationsController.acceptInvitation);
router.post('/:invitationId/suggest', authenticateToken, dinnerInvitationsController.suggestChanges);
router.post('/:invitationId/decline', authenticateToken, dinnerInvitationsController.declineInvitation);

module.exports = router;
