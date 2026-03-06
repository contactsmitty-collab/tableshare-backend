const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const { authenticateToken } = require('../middleware/auth');

router.post('/invite', authenticateToken, referralController.createInvite);
router.get('/my', authenticateToken, referralController.getMyReferrals);

module.exports = router;
