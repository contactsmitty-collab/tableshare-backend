require('dotenv').config({ path: '.env.local' });
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Make io accessible to controllers via req.app
app.set('io', io);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health check (before static files)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Serve static portal files (admin and restaurant portals)
const portalsPath = path.join(__dirname, '../portals');
console.log('📁 Portals directory:', portalsPath);

// Check if portals directory exists
if (fs.existsSync(portalsPath)) {
  console.log('✅ Portals directory found');
  app.use(express.static(portalsPath));
  
  // Serve portal index.html at root
  app.get('/', (req, res) => {
    const indexPath = path.join(portalsPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Portal not found. Check server logs.' });
    }
  });
} else {
  console.log('⚠️ Portals directory not found at:', portalsPath);
  app.get('/', (req, res) => {
    res.json({ 
      error: 'Portal not configured',
      expectedPath: portalsPath,
      message: 'Please deploy portal files to /opt/tableshare-backend/portals/'
    });
  });
}

// Instagram OAuth callback - serves a simple page the mobile WebView intercepts
app.get('/auth/instagram/callback', (req, res) => {
  const code = req.query.code || '';
  const error = req.query.error || '';
  res.send(`<!DOCTYPE html><html><body>
    <h2>Instagram Authorization</h2>
    <p>${code ? 'Linking your account...' : 'Authorization failed: ' + error}</p>
    <script>window.close();</script>
  </body></html>`);
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    message: '🍽️ TableShare API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      restaurants: '/api/v1/restaurants',
      checkins: '/api/v1/checkins',
      matches: '/api/v1/matches',
      messages: '/api/v1/messages',
      ratings: '/api/v1/ratings',
      notifications: '/api/v1/notifications',
      instagram: '/api/v1/instagram',
      photos: '/api/v1/photos',
      points: '/api/v1/points',
      prompts: '/api/v1/prompts',
      admin: '/api/v1/admin',
      gamification: '/api/v1/gamification',
      loyalty: '/api/v1/loyalty',
      challenges: '/api/v1/challenges',
      recommendations: '/api/v1/recommendations',
      rewards: '/api/v1/rewards',
    },
  });
});

// Route imports
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const restaurantRoutes = require('./routes/restaurant.routes');
const checkinRoutes = require('./routes/checkin.routes');
const matchRoutes = require('./routes/match.routes');
const messageRoutes = require('./routes/message.routes');
const ratingRoutes = require('./routes/rating.routes');
const notificationRoutes = require('./routes/notification.routes');
const instagramRoutes = require('./routes/instagram.routes');
const photoRoutes = require('./routes/photo.routes');
const pointsRoutes = require('./routes/points.routes');
const promptRoutes = require('./routes/prompt.routes');
const adminRoutes = require('./routes/admin.routes');
const groupDiningRoutes = require('./routes/groupDining.routes');
const loyaltyRoutes = require('./routes/loyalty.routes');
const challengeRoutes = require('./routes/challenge.routes');
const recommendationRoutes = require('./routes/recommendation.routes');
let rewardsRoutes;
try {
  rewardsRoutes = require('./routes/rewards.routes');
} catch (_) {
  rewardsRoutes = null;
}
const tableAlertsRoutes = require('./routes/tableAlerts.routes');
const diningListsRoutes = require('./routes/diningLists.routes');
const dinnerInvitationsRoutes = require('./routes/dinnerInvitations.routes');
const tableMatchmakerRoutes = require('./routes/tableMatchmaker.routes');

// Register routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/restaurants', restaurantRoutes);
app.use('/api/v1/checkins', checkinRoutes);
app.use('/api/v1/matches', matchRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/ratings', ratingRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/instagram', instagramRoutes);
app.use('/api/v1/photos', photoRoutes);
app.use('/api/v1/points', pointsRoutes);
app.use('/api/v1/prompts', promptRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/group-dining', groupDiningRoutes);
app.use('/api/v1/loyalty', loyaltyRoutes);
app.use('/api/v1/challenges', challengeRoutes);
app.use('/api/v1/recommendations', recommendationRoutes);
if (rewardsRoutes) app.use('/api/v1/rewards', rewardsRoutes);
app.use('/api/v1/table-alerts', tableAlertsRoutes);
app.use('/api/v1/dining-lists', diningListsRoutes);
app.use('/api/v1/dinner-invitations', dinnerInvitationsRoutes);
app.use('/api/v1/table-matchmaker', tableMatchmakerRoutes);

app.use(errorHandler);

// --- Socket.IO ---

// Track connected users: userId -> Set<socketId>
const connectedUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log(`🔌 Socket connected: ${userId} (${socket.id})`);

  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set());
  }
  connectedUsers.get(userId).add(socket.id);

  // Join a room for a match conversation
  socket.on('join_chat', (matchId) => {
    socket.join(`chat:${matchId}`);
    console.log(`💬 ${userId} joined chat:${matchId}`);
  });

  socket.on('leave_chat', (matchId) => {
    socket.leave(`chat:${matchId}`);
  });

  // Real-time typing indicators
  socket.on('typing', ({ matchId }) => {
    socket.to(`chat:${matchId}`).emit('user_typing', { userId, matchId });
  });

  socket.on('stop_typing', ({ matchId }) => {
    socket.to(`chat:${matchId}`).emit('user_stop_typing', { userId, matchId });
  });

  socket.on('disconnect', () => {
    const sockets = connectedUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) connectedUsers.delete(userId);
    }
    console.log(`🔌 Socket disconnected: ${userId}`);
  });
});

// Helper to emit to a specific user across all their connected sockets
app.set('emitToUser', (userId, event, data) => {
  const sockets = connectedUsers.get(userId);
  if (sockets) {
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }
});

// Ensure reservations table exists in the DB this server uses (fixes "relation does not exist" if migrations ran elsewhere)
const { pool } = require('./config/database');

// Ensure device_tokens table exists for push notification registration (avoids 500/502 when table missing)
const ensureDeviceTokensTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        platform VARCHAR(20) DEFAULT 'ios',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (token)
      );
      CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON device_tokens(token);
    `);
    console.log('   🔔 Device tokens table ready');
  } catch (err) {
    console.warn('   ⚠️  Could not ensure device_tokens table:', err.message);
  }
};

const ensureReservationsTable = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS reservations (
      reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      reservation_date DATE NOT NULL,
      reservation_time TIME NOT NULL,
      party_size INTEGER NOT NULL,
      table_type VARCHAR(50),
      status VARCHAR(50) DEFAULT 'pending',
      source VARCHAR(50) DEFAULT 'app',
      external_booking_id VARCHAR(255),
      external_booking_url TEXT,
      special_requests TEXT,
      occasion VARCHAR(100),
      guest_name VARCHAR(255),
      guest_phone VARCHAR(50),
      guest_email VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      confirmed_at TIMESTAMP WITH TIME ZONE,
      cancelled_at TIMESTAMP WITH TIME ZONE,
      confirmation_code VARCHAR(20),
      notes TEXT,
      rating_after_visit INTEGER CHECK (rating_after_visit >= 1 AND rating_after_visit <= 5)
    );
    CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(reservation_date);
    CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
    CREATE INDEX IF NOT EXISTS idx_reservations_date_status ON reservations(reservation_date, status);
  `;
  try {
    await pool.query(sql);
    console.log('   📅 Reservations table ready');
  } catch (err) {
    console.warn('   ⚠️  Could not ensure reservations table:', err.message);
  }
};

// Ensure restaurants has reservation/waitlist columns (fixes "column does not exist" if migrations ran elsewhere)
const ensureRestaurantReservationColumns = async () => {
  const statements = [
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS accepts_reservations BOOLEAN DEFAULT true',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_provider VARCHAR(50)',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_provider_id VARCHAR(255)',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_url TEXT',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_phone VARCHAR(50)',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_lead_time_hours INTEGER DEFAULT 2',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS max_party_size INTEGER DEFAULT 10',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS min_party_size INTEGER DEFAULT 1',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS reservation_duration_minutes INTEGER DEFAULT 120',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS has_waitlist BOOLEAN DEFAULT true',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS waitlist_max_party_size INTEGER DEFAULT 10',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS waitlist_notes TEXT',
    'ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS avg_turn_time_minutes INTEGER DEFAULT 60',
  ];
  try {
    for (const sql of statements) {
      await pool.query(sql);
    }
    console.log('   🏪 Restaurant reservation/waitlist columns ready');
  } catch (err) {
    console.warn('   ⚠️  Could not ensure restaurant columns:', err.message);
  }
};

let ensureReservationSlots = null;
let runReservationReminders = null;
try {
  const slotService = require('./services/reservationSlotService');
  ensureReservationSlots = slotService.ensureReservationSlots;
} catch (_) {
  console.warn('   ⚠️  reservationSlotService not found – skipping slot setup');
}
try {
  const reminderJob = require('./services/reservationReminderJob');
  runReservationReminders = reminderJob.runReservationReminders;
} catch (_) {
  console.warn('   ⚠️  reservationReminderJob not found – skipping reminder job');
}

const ensureReservationSlotsOnStartup = async () => {
  if (!ensureReservationSlots) return;
  try {
    const { restaurants, slotsInserted } = await ensureReservationSlots(14);
    if (restaurants > 0) {
      console.log(`   📅 Reservation slots ensured for ${restaurants} restaurants (new slots: ${slotsInserted})`);
    }
  } catch (err) {
    console.warn('   ⚠️  Could not ensure reservation slots:', err.message);
  }
};

const runReservationRemindersOnStartup = async () => {
  if (!runReservationReminders) return;
  try {
    const result = await runReservationReminders();
    if (result.reminded24h > 0 || result.reminded1h > 0) {
      console.log(`   🔔 Reservation reminders sent: 24h=${result.reminded24h}, 1h=${result.reminded1h}`);
    }
  } catch (err) {
    console.warn('   ⚠️  Reservation reminder job failed:', err.message);
  }
};

const RESERVATION_REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await ensureDeviceTokensTable();
  await ensureReservationsTable();
  await ensureRestaurantReservationColumns();
  await ensureReservationSlotsOnStartup();
  await runReservationRemindersOnStartup();
  setInterval(runReservationRemindersOnStartup, RESERVATION_REMINDER_INTERVAL_MS);
  console.log(`\n🍽️  TableShare API Running!`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO ready`);
  console.log(`\n📋 Available Endpoints:`);
  console.log(`   🔐 Auth: /api/v1/auth`);
  console.log(`   👤 Users: /api/v1/users`);
  console.log(`   🏪 Restaurants: /api/v1/restaurants`);
  console.log(`   📍 Check-ins: /api/v1/checkins`);
  console.log(`   💑 Matches: /api/v1/matches`);
  console.log(`   💬 Messages: /api/v1/messages`);
  console.log(`   ⭐ Ratings: /api/v1/ratings`);
  console.log(`   🔔 Notifications: /api/v1/notifications`);
  console.log(`   📷 Instagram: /api/v1/instagram`);
  console.log(`   🖼️  Photos: /api/v1/photos`);
  console.log(`   🎯 Points: /api/v1/points`);
  console.log(`   🪑 Rewards: /api/v1/rewards`);
  console.log(`   💬 Prompts: /api/v1/prompts`);
  console.log(`   👑 Admin: /api/v1/admin\n`);
});
