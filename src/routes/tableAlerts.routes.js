const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const tableAlertsController = require('../controllers/tableAlertsController');

router.get('/my', authenticateToken, tableAlertsController.getMyAlerts);
router.get('/matching', authenticateToken, tableAlertsController.getMatchingAlerts);
router.get('/demand/:restaurantId', tableAlertsController.getDemandSignal);
router.post('/', authenticateToken, tableAlertsController.createAlert);
router.delete('/:alertId', authenticateToken, tableAlertsController.deleteAlert);

module.exports = router;
