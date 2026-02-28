#!/usr/bin/env node
/**
 * Infer and seed tags for all restaurants based on existing columns
 * (cuisine_type, venue_type, has_* flags, rating, price_range, name).
 *
 * Usage:
 *   cd tableshare-backend && node scripts/seed-restaurant-tags.js
 *   node scripts/seed-restaurant-tags.js dry    # preview only
 */

const path = require('path');
const root = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env.local') });
require('dotenv').config({ path: path.join(root, '.env') });

const { Pool } = require('pg');
const parseConnectionString = require('pg-connection-string').parse;

const osUser = process.env.USER || process.env.USERNAME || 'postgres';

function buildPool() {
  let connStr = process.env.DATABASE_URL || `postgresql://${osUser}@localhost:5432/tableshare_dev`;
  connStr = connStr.replace(/postgresql:\/\/postgres(:[^@]*)?@/, `postgresql://${osUser}@`);
  const parsed = parseConnectionString(connStr);
  const pw = parsed.password || process.env.PGPASSWORD || '';
  return new Pool({
    host: parsed.host || 'localhost',
    port: parsed.port || 5432,
    user: parsed.user || osUser,
    database: parsed.database || 'tableshare_dev',
    password: pw,
    ssl: parsed.ssl,
  });
}

function inferTags(r) {
  const tags = new Set();
  const lower = (v) => (v || '').toLowerCase();
  const cuisine = lower(r.cuisine_type);
  const name = lower(r.name);
  const venueType = lower(r.venue_type);
  const price = (r.price_range || '').trim();

  // Brunch
  if (r.has_brunch) tags.add('brunch');
  if (cuisine.includes('brunch') || name.includes('brunch')) tags.add('brunch');

  // Late night
  if (r.has_late_night) tags.add('late_night');
  if (venueType === 'bar' || venueType === 'nightclub' || venueType === 'lounge' || venueType === 'speakeasy') {
    tags.add('late_night');
  }

  // Quick service / lunch
  if (cuisine.includes('fast') || cuisine.includes('deli') || cuisine.includes('sandwich') || cuisine.includes('cafe')) {
    tags.add('quick_service');
    tags.add('lunch');
  }
  if (name.includes('cafe') || name.includes('deli') || name.includes('sandwich')) {
    tags.add('lunch');
  }

  // Outdoor dining
  if (r.has_outdoor_seating) {
    tags.add('patio');
  }
  if (venueType === 'rooftop_bar' || venueType === 'rooftop') {
    tags.add('rooftop');
    tags.add('patio');
  }
  if (name.includes('rooftop') || name.includes('terrace') || name.includes('garden')) {
    tags.add('patio');
  }

  // Solo friendly
  if (venueType === 'bar' || venueType === 'lounge' || venueType === 'speakeasy') {
    tags.add('solo_friendly');
    tags.add('counter_seating');
  }
  if (cuisine.includes('ramen') || cuisine.includes('sushi') || cuisine.includes('noodle')) {
    tags.add('solo_friendly');
    tags.add('counter_seating');
    tags.add('ramen_bar');
  }

  // Business friendly
  if (price === '$$$' || price === '$$$$' || price === '3' || price === '4') {
    tags.add('business_friendly');
  }
  if (r.has_private_rooms) tags.add('business_friendly');
  if (cuisine.includes('steakhouse') || cuisine.includes('fine dining')) {
    tags.add('business_friendly');
  }

  // Tapas / small plates
  if (cuisine.includes('tapas') || cuisine.includes('small plate')) {
    tags.add('tapas');
    tags.add('small_plates');
  }
  if (cuisine.includes('spanish') || cuisine.includes('mediterranean')) {
    tags.add('tapas');
  }
  if (name.includes('tapas') || name.includes('pintxo')) {
    tags.add('tapas');
    tags.add('small_plates');
  }

  // Food hall
  if (cuisine.includes('food hall') || cuisine.includes('food court')) {
    tags.add('food_hall');
  }
  if (name.includes('food hall') || name.includes('market') || name.includes('food court')) {
    tags.add('food_hall');
  }

  // Communal seating
  if (cuisine.includes('ramen') || cuisine.includes('noodle') || cuisine.includes('izakaya')) {
    tags.add('communal');
    tags.add('ramen_bar');
  }

  // Hotel restaurant
  if (name.includes('hotel') || name.includes('inn ') || name.includes('resort')) {
    tags.add('hotel_restaurant');
    tags.add('business_friendly');
  }

  // Hidden gems: high rating, presumably fewer reviews
  const rating = parseFloat(r.rating) || 0;
  const totalRatings = parseInt(r.total_ratings || r.review_count || '0', 10);
  if (rating >= 4.0 && totalRatings < 20) {
    tags.add('hidden_gem');
  }

  // Quiet / calm vibes
  if (cuisine.includes('tea') || cuisine.includes('cafe') || name.includes('tea house')) {
    tags.add('quiet');
    tags.add('calm');
  }
  if (cuisine.includes('fine dining')) {
    tags.add('quiet');
  }

  return [...tags];
}

async function main() {
  const dryRun = process.argv.includes('dry');
  const pool = buildPool();

  try {
    const { rows } = await pool.query('SELECT * FROM restaurants');
    console.log(`Found ${rows.length} restaurants`);

    let updated = 0;
    for (const r of rows) {
      const tags = inferTags(r);
      if (tags.length === 0) continue;

      if (dryRun) {
        console.log(`  [dry] ${r.name}: ${tags.join(', ')}`);
        updated++;
        continue;
      }

      await pool.query(
        `UPDATE restaurants SET tags = $1 WHERE restaurant_id = $2`,
        [tags, r.restaurant_id]
      );
      updated++;
    }

    console.log(`${dryRun ? 'Would update' : 'Updated'} ${updated} restaurant(s) with tags.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
