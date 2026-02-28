const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const { authenticateToken } = require('../middleware/auth');

router.get('/my', authenticateToken, matchController.getMyMatches);
router.get('/pending', authenticateToken, matchController.getPendingMatches);
router.get('/smart/discover', authenticateToken, matchController.getSmartMatches);
router.get('/:matchId', authenticateToken, matchController.getMatchById);
router.post('/request', authenticateToken, matchController.requestMatch);
router.post('/:matchId/accept', authenticateToken, matchController.acceptMatch);
router.post('/:matchId/reject', authenticateToken, matchController.rejectMatch);
router.delete('/:matchId', authenticateToken, matchController.deleteMatch);

module.exports = router;
