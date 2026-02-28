/**
 * Ensures reservation_slots exist for the next N days for all restaurants
 * that accept reservations. Safe to run daily or on startup (uses ON CONFLICT DO NOTHING).
 * Matches migration 010_seed_reservation_slots.sql time slots and party-size bands.
 */

const { query } = require('../config/database');

const TIME_SLOTS = [
  '17:00:00', '17:30:00', '18:00:00', '18:30:00',
  '19:00:00', '19:30:00', '20:00:00', '20:30:00',
  '21:00:00', '21:30:00'
];

// Party size bands: [2, 4, 6, 8] -> (min, max) = (1-2, 3-4, 5-6, 7-8)
const PARTY_BANDS = [
  { min: 1, max: 2 },
  { min: 3, max: 4 },
  { min: 5, max: 6 },
  { min: 7, max: 8 }
];

const DEFAULT_AVAILABLE_TABLES = 3;
const DEFAULT_TOTAL_TABLES = 4;

/**
 * Ensure slots exist for today through today + (daysAhead - 1).
 * @param {number} daysAhead - Number of days to ensure (default 14)
 * @returns {{ restaurants: number, slotsInserted: number }}
 */
async function ensureReservationSlots(daysAhead = 14) {
  const restaurantsResult = await query(
    `SELECT restaurant_id FROM restaurants
     WHERE accepts_reservations = true OR accepts_reservations IS NULL`
  );
  const restaurantIds = restaurantsResult.rows.map(r => r.restaurant_id);
  if (restaurantIds.length === 0) {
    return { restaurants: 0, slotsInserted: 0 };
  }

  let slotsInserted = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let d = 0; d < daysAhead; d++) {
    const slotDate = new Date(today);
    slotDate.setDate(slotDate.getDate() + d);
    const dateStr = slotDate.toISOString().slice(0, 10); // YYYY-MM-DD

    for (const restaurantId of restaurantIds) {
      for (const slotTime of TIME_SLOTS) {
        for (const band of PARTY_BANDS) {
          const result = await query(
            `INSERT INTO reservation_slots (
              restaurant_id, slot_date, slot_time, party_size_min, party_size_max,
              available_tables, total_tables, is_available
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            ON CONFLICT (restaurant_id, slot_date, slot_time, party_size_min, party_size_max) DO NOTHING`,
            [
              restaurantId,
              dateStr,
              slotTime,
              band.min,
              band.max,
              DEFAULT_AVAILABLE_TABLES,
              DEFAULT_TOTAL_TABLES
            ]
          );
          if (result.rowCount > 0) slotsInserted += result.rowCount;
        }
      }
    }
  }

  return { restaurants: restaurantIds.length, slotsInserted };
}

module.exports = { ensureReservationSlots };
