#!/usr/bin/env node
/**
 * Seed test users and feature data for validating Table Alerts, Dining Lists,
 * Invite a Guest, and Matches on the platform.
 *
 * Usage: node scripts/seed-test-users-and-features.js
 * Uses DATABASE_URL from .env or .env.local (same as seed-portal-users.js).
 *
 * Test accounts (all password: Test123!):
 *   alice@test.tableshare.app   – has alerts, lists, sent/received invites, matches
 *   bob@test.tableshare.app     – has alerts, lists, received invite from Alice, match with Alice
 *   carol@test.tableshare.app   – has lists, pending match
 *   dave@test.tableshare.app    – has list, accepted dinner with Alice
 *   eve@test.tableshare.app     – minimal profile for Table Matchmaker testing
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcrypt');
const { query } = require('../src/config/database');

const TEST_PASSWORD = 'Test123!';

const TEST_USERS = [
  { email: 'alice@test.tableshare.app', firstName: 'Alice', lastName: 'Smith', bio: 'Love trying new spots. Italian and sushi fan.' },
  { email: 'bob@test.tableshare.app', firstName: 'Bob', lastName: 'Martinez', bio: 'Food lover, always up for sharing a table.' },
  { email: 'carol@test.tableshare.app', firstName: 'Carol', lastName: 'Chen', bio: 'Wine and small plates. Downtown Chicago.' },
  { email: 'dave@test.tableshare.app', firstName: 'Dave', lastName: 'Wilson', bio: 'Brunch king. Casual dining.' },
  { email: 'eve@test.tableshare.app', firstName: 'Eve', lastName: 'Jones', bio: 'New to TableShare. Open to suggestions!' },
];

async function ensureUser(u) {
  const email = u.email.trim().toLowerCase();
  const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  if (existing.rows.length > 0) {
    await query(
      `UPDATE users SET password_hash = $1, first_name = $2, last_name = $3, bio = COALESCE($4, bio) WHERE user_id = $5`,
      [passwordHash, u.firstName, u.lastName, u.bio || null, existing.rows[0].user_id]
    );
    return existing.rows[0].user_id;
  }
  const insert = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, bio)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING user_id`,
    [email, passwordHash, u.firstName, u.lastName, u.bio || null]
  );
  return insert.rows[0].user_id;
}

async function run() {
  console.log('Seeding test users and feature data...\n');

  const userIds = {};
  for (const u of TEST_USERS) {
    const id = await ensureUser(u);
    userIds[u.email] = id;
    console.log('User:', u.email, '->', id);
  }

  const restaurants = await query(
    `SELECT restaurant_id, name FROM restaurants WHERE city ILIKE '%Chicago%' ORDER BY name LIMIT 12`
  );
  if (restaurants.rows.length === 0) {
    const any = await query('SELECT restaurant_id, name FROM restaurants ORDER BY name LIMIT 12');
    restaurants.rows = any.rows;
  }
  const restIds = restaurants.rows.map((r) => r.restaurant_id);
  if (restIds.length < 3) {
    console.warn('Need at least 3 restaurants. Found:', restIds.length);
    process.exit(1);
  }
  console.log('Using', restIds.length, 'restaurants\n');

  const alice = userIds['alice@test.tableshare.app'];
  const bob = userIds['bob@test.tableshare.app'];
  const carol = userIds['carol@test.tableshare.app'];
  const dave = userIds['dave@test.tableshare.app'];
  const eve = userIds['eve@test.tableshare.app'];

  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const fmt = (d) => d.toISOString().slice(0, 10);

  // ----- Table Alerts -----
  const alertRows = await query(
    'SELECT 1 FROM table_alerts WHERE user_id = $1 LIMIT 1',
    [alice]
  );
  if (alertRows.rows.length === 0) {
    await query(
      `INSERT INTO table_alerts (user_id, restaurant_id, start_date, end_date, time_preference) VALUES ($1, $2, $3, $4, 'dinner')`,
      [alice, restIds[0], fmt(today), fmt(nextWeek)]
    );
    await query(
      `INSERT INTO table_alerts (user_id, restaurant_id, start_date, end_date, time_preference) VALUES ($1, $2, $3, $4, 'any')`,
      [alice, restIds[1], fmt(today), fmt(nextWeek)]
    );
    await query(
      `INSERT INTO table_alerts (user_id, restaurant_id, start_date, end_date, time_preference) VALUES ($1, $2, $3, $4, 'dinner')`,
      [bob, restIds[0], fmt(today), fmt(nextWeek)]
    );
    console.log('Table alerts created (Alice x2, Bob x1)');
  }

  // ----- Dining Lists -----
  for (const [email, userId] of Object.entries(userIds)) {
    const listCheck = await query('SELECT list_id FROM dining_lists WHERE user_id = $1 LIMIT 1', [userId]);
    if (listCheck.rows.length > 0) continue;

    const defaultList = await query(
      `INSERT INTO dining_lists (user_id, name, is_default) VALUES ($1, 'Want to Try', true) RETURNING list_id`,
      [userId]
    );
    const listId = defaultList.rows[0].list_id;
    await query(`INSERT INTO dining_list_entries (list_id, restaurant_id) VALUES ($1, $2)`, [listId, restIds[0]]);
    await query(`INSERT INTO dining_list_entries (list_id, restaurant_id) VALUES ($1, $2)`, [listId, restIds[1]]);
    if (restIds[2]) await query(`INSERT INTO dining_list_entries (list_id, restaurant_id) VALUES ($1, $2)`, [listId, restIds[2]]);

    const extra = await query(
      `INSERT INTO dining_lists (user_id, name, is_default) VALUES ($1, 'Date Night Spots', false) RETURNING list_id`,
      [userId]
    );
    await query(`INSERT INTO dining_list_entries (list_id, restaurant_id) VALUES ($1, $2)`, [extra.rows[0].list_id, restIds[1]]);
    if (restIds[3]) await query(`INSERT INTO dining_list_entries (list_id, restaurant_id) VALUES ($1, $2)`, [extra.rows[0].list_id, restIds[3]]);
  }
  console.log('Dining lists and entries created for all test users');

  // ----- Dinner Invitations -----
  const invCheck = await query('SELECT 1 FROM dinner_invitations WHERE initiator_id = $1 LIMIT 1', [alice]);
  if (invCheck.rows.length === 0) {
    const nextSat = new Date(today);
    nextSat.setDate(nextSat.getDate() + ((6 - nextSat.getDay() + 7) % 7) + 7);
    await query(
      `INSERT INTO dinner_invitations (initiator_id, companion_id, restaurant_id, proposed_date, proposed_time, initiator_notes, status)
       VALUES ($1, $2, $3, $4, '19:00', 'Excited to try this place!', 'pending')`,
      [alice, bob, restIds[0], fmt(nextSat)]
    );
    await query(
      `INSERT INTO dinner_invitations (initiator_id, companion_id, restaurant_id, proposed_date, proposed_time, initiator_notes, status)
       VALUES ($1, $2, $3, $4, '12:30', 'Brunch?', 'accepted')`,
      [alice, dave, restIds[1], fmt(nextSat)]
    );
    await query(
      `UPDATE dinner_invitations SET companion_dietary_notes = 'No shellfish' WHERE initiator_id = $1 AND companion_id = $2`,
      [alice, dave]
    );
    await query(
      `INSERT INTO dinner_invitations (initiator_id, companion_id, restaurant_id, proposed_date, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [bob, carol, restIds[2], fmt(nextSat)]
    );
    console.log('Dinner invitations created (Alice->Bob pending, Alice->Dave accepted, Bob->Carol pending)');
  }

  // ----- Matches -----
  const matchCheck = await query('SELECT 1 FROM matches WHERE requester_id = $1 LIMIT 1', [alice]);
  if (matchCheck.rows.length === 0) {
    await query(
      `INSERT INTO matches (requester_id, receiver_id, restaurant_id, status) VALUES ($1, $2, $3, 'pending')`,
      [bob, alice, restIds[0]]
    );
    await query(
      `INSERT INTO matches (requester_id, receiver_id, restaurant_id, status) VALUES ($1, $2, $3, 'accepted')`,
      [alice, dave, restIds[1]]
    );
    await query(
      `INSERT INTO matches (requester_id, receiver_id, restaurant_id, status) VALUES ($1, $2, $3, 'pending')`,
      [carol, alice, restIds[2]]
    );
    console.log('Matches created (Bob->Alice pending, Alice->Dave accepted, Carol->Alice pending)');
  }

  console.log('\n✅ Seed complete.\n');
  console.log('Test logins (password for all: ' + TEST_PASSWORD + '):');
  TEST_USERS.forEach((u) => console.log('  ', u.email));
  console.log('\nUse these in the app to validate Table Alerts, Dining Lists, Invite a Guest, and Matches.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
