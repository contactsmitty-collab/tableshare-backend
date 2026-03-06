const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const gc = require('../controllers/groupDiningController');

router.use(authenticateToken);

router.get('/search-users', gc.searchUsers);
router.post('/', gc.createGroup);
router.post('/join-by-code', gc.joinByCode);
router.get('/invites/me', gc.getMyInvites);
router.get('/invites/groups', gc.getGroupInvites);
router.get('/events/my', gc.getMyGroupEvents);
router.get('/events/:eventId', gc.getGroupEventDetail);
router.post('/events/:eventId/rsvp', gc.rsvpToGroupEvent);
router.post('/:groupId/events', gc.createGroupEvent);
router.get('/:groupId', gc.getGroupDetails);
router.post('/:groupId/invite-user', gc.inviteUser);
router.post('/:groupId/invite-group', gc.inviteGroup);
router.post('/:groupId/checkin', gc.groupCheckIn);
router.post('/:groupId/checkout', gc.groupCheckOut);
router.post('/invites/:inviteId/respond', gc.respondToInvite);
router.get('/at-restaurant/:restaurantId', gc.discoverGroupsAtRestaurant);

module.exports = router;
