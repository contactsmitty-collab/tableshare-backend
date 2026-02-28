const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const diningListsController = require('../controllers/diningListsController');

router.get('/my', authenticateToken, diningListsController.getMyLists);
router.get('/signal/:restaurantId', diningListsController.getRestaurantMatchSignal);
router.post('/ensure-default', authenticateToken, diningListsController.ensureDefaultList);
router.post('/', authenticateToken, diningListsController.createList);
router.get('/:listId', authenticateToken, diningListsController.getListDetail);
router.post('/:listId/restaurants', authenticateToken, diningListsController.addRestaurant);
router.delete('/:listId/restaurants/:restaurantId', authenticateToken, diningListsController.removeRestaurant);

module.exports = router;
