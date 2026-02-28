const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { query } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { moderateImage } = require('../utils/photoModeration');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    }
    cb(new AppError('Only image files are allowed', 400));
  },
});

const uploadToCloudinary = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    stream.end(buffer);
  });
};

// Upload profile photo
router.post('/profile', authenticateToken, upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const { allowed } = await moderateImage(req.file.buffer, req.file.mimetype);
  if (!allowed) {
    throw new AppError('Photo didn\'t meet guidelines. Please choose a different photo.', 403);
  }

  const userId = req.user.userId;

  // Delete old photo from Cloudinary if it exists
  const existingUser = await query('SELECT profile_photo_url FROM users WHERE user_id = $1', [userId]);
  const oldUrl = existingUser.rows[0]?.profile_photo_url;
  if (oldUrl && oldUrl.includes('cloudinary')) {
    try {
      const publicId = oldUrl.split('/').slice(-2).join('/').split('.')[0];
      await cloudinary.uploader.destroy(`tableshare/${publicId}`);
    } catch (e) {
      console.warn('Failed to delete old Cloudinary image:', e.message);
    }
  }

  const result = await uploadToCloudinary(req.file.buffer, {
    folder: 'tableshare/profiles',
    public_id: `user_${userId}_${Date.now()}`,
    transformation: [
      { width: 500, height: 500, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });

  const photoUrl = result.secure_url;

  await query(
    'UPDATE users SET profile_photo_url = $1 WHERE user_id = $2',
    [photoUrl, userId]
  );

  res.json({
    message: 'Photo uploaded successfully',
    photo_url: photoUrl,
  });
}));

// Upload check-in photo
router.post('/checkin', authenticateToken, upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const userId = req.user.userId;

  const result = await uploadToCloudinary(req.file.buffer, {
    folder: 'tableshare/checkins',
    public_id: `checkin_${userId}_${Date.now()}`,
    transformation: [
      { width: 1200, height: 900, crop: 'limit' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });

  res.json({
    message: 'Photo uploaded successfully',
    photo_url: result.secure_url,
  });
}));

// Submit photo verification selfie
router.post('/verify', authenticateToken, upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('No selfie uploaded', 400);
  }

  const userId = req.user.userId;

  const userResult = await query(
    'SELECT profile_photo_url, is_photo_verified FROM users WHERE user_id = $1',
    [userId]
  );

  if (userResult.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  const user = userResult.rows[0];

  if (!user.profile_photo_url) {
    throw new AppError('You must upload a profile photo before verifying', 400);
  }

  if (user.is_photo_verified) {
    return res.json({ message: 'Already verified', is_photo_verified: true });
  }

  const { allowed } = await moderateImage(req.file.buffer, req.file.mimetype);
  if (!allowed) {
    throw new AppError('Photo didn\'t meet guidelines. Please choose a different photo.', 403);
  }

  const result = await uploadToCloudinary(req.file.buffer, {
    folder: 'tableshare/verification',
    public_id: `verify_${userId}_${Date.now()}`,
    transformation: [
      { width: 500, height: 500, crop: 'fill', gravity: 'face' },
      { quality: 'auto', fetch_format: 'auto' },
    ],
  });

  await query(
    `UPDATE users SET
      verification_photo_url = $1,
      is_photo_verified = TRUE,
      verification_status = 'verified',
      verified_at = NOW()
    WHERE user_id = $2`,
    [result.secure_url, userId]
  );

  res.json({
    message: 'Photo verification complete!',
    is_photo_verified: true,
    verification_photo_url: result.secure_url,
  });
}));

// Get verification status
router.get('/verify/status', authenticateToken, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT is_photo_verified, verification_status, verified_at FROM users WHERE user_id = $1',
    [req.user.userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  res.json(result.rows[0]);
}));

// Delete profile photo
router.delete('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.userId;

  const existingUser = await query('SELECT profile_photo_url FROM users WHERE user_id = $1', [userId]);
  const oldUrl = existingUser.rows[0]?.profile_photo_url;

  if (oldUrl && oldUrl.includes('cloudinary')) {
    try {
      const parts = oldUrl.split('/');
      const folderAndFile = parts.slice(-2).join('/');
      const publicId = `tableshare/${folderAndFile.split('.')[0]}`;
      await cloudinary.uploader.destroy(publicId);
    } catch (e) {
      console.warn('Failed to delete Cloudinary image:', e.message);
    }
  }

  await query(
    'UPDATE users SET profile_photo_url = NULL WHERE user_id = $1',
    [userId]
  );

  res.json({ message: 'Photo deleted successfully' });
}));

module.exports = router;
