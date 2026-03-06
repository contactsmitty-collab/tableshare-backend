const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const checkinController = require('../controllers/checkinController');
const { authenticateToken } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_EXTENSIONS = /\.(jpe?g|png|gif)$/i;
const ALLOWED_MIMES = /^image\/(jpeg|jpg|png|gif)$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mimeOk = ALLOWED_MIMES.test(file.mimetype);
    const extOk = !file.originalname || ALLOWED_EXTENSIONS.test(file.originalname);
    if (mimeOk && extOk) {
      return cb(null, true);
    }
    cb(new AppError('Only image files (JPEG, PNG, GIF) are allowed', 400));
  },
});

router.get('/my', authenticateToken, checkinController.getMyCheckIns);
router.get('/my-active', authenticateToken, checkinController.getMyActiveCheckIns);
router.post('/', authenticateToken, upload.single('photo'), checkinController.createCheckIn);
router.get('/restaurant/:restaurantId', authenticateToken, checkinController.getRestaurantCheckIns);
router.get('/active/:restaurantId', authenticateToken, checkinController.getActiveCheckIn);
router.get('/groups', authenticateToken, checkinController.getMyGroups);
router.get('/groups/discover/all', authenticateToken, checkinController.discoverGroups);
router.post('/groups', authenticateToken, checkinController.createGroup);
router.get('/groups/:groupId/members', authenticateToken, checkinController.getGroupMembers);
router.post('/groups/:groupId/join', authenticateToken, checkinController.joinGroup);
router.post('/groups/:groupId/leave', authenticateToken, checkinController.leaveGroup);
router.post('/:checkInId/deactivate', authenticateToken, checkinController.deactivateCheckIn);
router.delete('/:checkInId', authenticateToken, checkinController.deleteCheckIn);

module.exports = router;
