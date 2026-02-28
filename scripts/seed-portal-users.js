#!/usr/bin/env node
/**
 * Seed admin and restaurant portal users.
 * Usage: node scripts/seed-portal-users.js
 * Uses DATABASE_URL or default local DB (see src/config/database.js).
 *
 * Edit the USERS array below to add/change users. Passwords are hashed with bcrypt.
 * For restaurant users, restaurant_id is assigned from existing restaurants in order.
 *
 * If you get "password authentication failed for user postgres":
 * - Ensure .env.local has DATABASE_URL with the correct password for your Postgres.
 * - Or unset DATABASE_URL to use your OS username (no password): postgresql://YOUR_USER@localhost:5432/tableshare_dev
 * - See docs/DATABASE-CONNECTION-TROUBLESHOOTING.md for resetting the postgres password.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const { query } = require('../src/config/database');

const USERS = [
  // Admin users (portal: Admin dashboard)
  { email: 'admin@pixelcheese.com', password: 'ChangeMe123!', first_name: 'Admin', last_name: 'User', role: 'admin' },
  { email: 'todd@pixelcheese.com', password: 'ChangeMe123!', first_name: 'Todd', last_name: 'Admin', role: 'admin' },
  // Restaurant users (portal: Restaurant dashboard) — restaurant_id assigned by script from DB
  { email: 'restaurant1@pixelcheese.com', password: 'ChangeMe123!', first_name: 'Restaurant', last_name: 'One', role: 'restaurant' },
  { email: 'restaurant2@pixelcheese.com', password: 'ChangeMe123!', first_name: 'Restaurant', last_name: 'Two', role: 'restaurant' },
];

async function run() {
  console.log('Seeding portal users...\n');

  const restaurantUsers = USERS.filter((u) => u.role === 'restaurant');
  let restaurantIds = [];
  if (restaurantUsers.length > 0) {
    const rest = await query('SELECT restaurant_id FROM restaurants ORDER BY name LIMIT $1', [restaurantUsers.length]);
    restaurantIds = rest.rows.map((r) => r.restaurant_id);
    if (restaurantIds.length < restaurantUsers.length) {
      console.warn(
        `Warning: Only ${restaurantIds.length} restaurant(s) in DB. Some restaurant users may not get a restaurant_id.`
      );
    }
  }

  let restaurantIndex = 0;
  for (const u of USERS) {
    const email = u.email.trim().toLowerCase();
    const existing = await query('SELECT user_id, email FROM users WHERE email = $1', [email]);

    const passwordHash = await bcrypt.hash(u.password, 10);
    const isAdmin = u.role === 'admin';
    const restaurantId = u.role === 'restaurant' ? restaurantIds[restaurantIndex++] || null : null;

    if (existing.rows.length > 0) {
      await query(
        `UPDATE users SET password_hash = $1, first_name = $2, last_name = $3, role = $4, is_admin = $5, restaurant_id = $6 WHERE user_id = $7`,
        [
          passwordHash,
          u.first_name,
          u.last_name,
          u.role,
          isAdmin,
          restaurantId,
          existing.rows[0].user_id,
        ]
      );
      console.log('Updated:', email, `(${u.role})`);
    } else {
      await query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, is_admin, restaurant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [email, passwordHash, u.first_name, u.last_name, u.role, isAdmin, restaurantId]
      );
      console.log('Created:', email, `(${u.role})`);
    }
  }

  console.log('\nDone. Change passwords after first login (use Forgot password or set in DB).');
}

run().catch((err) => {
  if (err.code === '28P01' || (err.message && err.message.includes('password authentication failed'))) {
    console.error('\n❌ Database login failed. Your Postgres user/password don\'t match DATABASE_URL.\n');
    console.error('  • Fix password: set DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/tableshare_dev in .env.local');
    console.error('  • Or use your Mac user (no password): in .env.local comment out or remove DATABASE_URL, then run:');
    console.error('    createdb tableshare_dev   # if the DB doesn\'t exist yet');
    console.error('  • Full guide: docs/DATABASE-CONNECTION-TROUBLESHOOTING.md\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});
