const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const checkinController = require('../controllers/checkinController');
const { authenticateToken } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  },
});

router.get('/my', authenticateToken, checkinController.getMyCheckIns);
router.post('/', authenticateToken, upload.single('photo'), checkinController.createCheckIn);
router.get('/restaurant/:restaurantId', authenticateToken, checkinController.getRestaurantCheckIns);
router.get('/active/:restaurantId', authenticateToken, checkinController.getActiveCheckIn);
router.get('/groups', authenticateToken, checkinController.getMyGroups);
router.get('/groups/discover/all', authenticateToken, checkinController.discoverGroups);
router.post('/groups', authenticateToken, checkinController.createGroup);
router.get('/groups/:groupId/members', authenticateToken, checkinController.getGroupMembers);
router.post('/groups/:groupId/join', authenticateToken, checkinController.joinGroup);
router.post('/groups/:groupId/leave', authenticateToken, checkinController.leaveGroup);
router.delete('/:checkInId', authenticateToken, checkinController.deleteCheckIn);

module.exports = router;
