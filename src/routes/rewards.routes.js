const express = require('express');
const router = express.Router();
const rewardsController = require('../controllers/rewardsController');
const { authenticateToken } = require('../middleware/auth');

router.get('/overview', authenticateToken, rewardsController.getOverview);
router.get('/catalog', authenticateToken, rewardsController.getCatalog);
router.post('/redeem', authenticateToken, rewardsController.redeem);

module.exports = router;
