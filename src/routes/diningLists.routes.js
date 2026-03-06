const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { publicSignalLimiter } = require('../middleware/rateLimit');
const diningListsController = require('../controllers/diningListsController');

router.get('/my', authenticateToken, diningListsController.getMyLists);
router.get('/signal/:restaurantId', publicSignalLimiter, diningListsController.getRestaurantMatchSignal);
router.post('/ensure-default', authenticateToken, diningListsController.ensureDefaultList);
router.post('/', authenticateToken, diningListsController.createList);
router.get('/:listId', authenticateToken, diningListsController.getListDetail);
router.patch('/:listId', authenticateToken, diningListsController.updateList);
router.delete('/:listId', authenticateToken, diningListsController.deleteList);
router.post('/:listId/duplicate', authenticateToken, diningListsController.duplicateList);
router.post('/:listId/members', authenticateToken, diningListsController.addListMember);
router.delete('/:listId/members/:memberId', authenticateToken, diningListsController.removeListMember);
router.put('/:listId/restaurants/order', authenticateToken, diningListsController.reorderEntries);
router.post('/:listId/restaurants', authenticateToken, diningListsController.addRestaurant);
router.patch('/:listId/restaurants/:restaurantId', authenticateToken, diningListsController.updateEntry);
router.delete('/:listId/restaurants/:restaurantId', authenticateToken, diningListsController.removeRestaurant);

module.exports = router;
