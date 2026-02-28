-- Migration: Seed reservation slots for restaurants
-- Created: 2026-02-18

-- Insert sample reservation slots for restaurants (next 7 days)
DO $$
DECLARE
    r RECORD;
    d DATE;
    t TIME;
    party_sizes INT[] := ARRAY[2, 4, 6, 8];
    time_slots TIME[] := ARRAY[
        '17:00:00', '17:30:00', '18:00:00', '18:30:00',
        '19:00:00', '19:30:00', '20:00:00', '20:30:00',
        '21:00:00', '21:30:00'
    ];
BEGIN
    -- For each restaurant that accepts reservations
    FOR r IN SELECT restaurant_id FROM restaurants WHERE accepts_reservations = true OR accepts_reservations IS NULL
    LOOP
        -- For next 7 days
        FOR i IN 0..6 LOOP
            d := CURRENT_DATE + i;

            -- Skip if slots already exist for this date
            IF NOT EXISTS (SELECT 1 FROM reservation_slots WHERE restaurant_id = r.restaurant_id AND slot_date = d LIMIT 1) THEN
                -- For each time slot
                FOREACH t IN ARRAY time_slots
                LOOP
                    -- For each party size
                    FOR j IN 1..array_length(party_sizes, 1) LOOP
                        INSERT INTO reservation_slots (
                            restaurant_id,
                            slot_date,
                            slot_time,
                            party_size_min,
                            party_size_max,
                            available_tables,
                            total_tables,
                            is_available
                        ) VALUES (
                            r.restaurant_id,
                            d,
                            t,
                            party_sizes[j] - 1, -- e.g., if party_size is 2, min is 1
                            party_sizes[j],
                            3, -- 3 tables available
                            4, -- 4 total tables
                            true
                        )
                        ON CONFLICT (restaurant_id, slot_date, slot_time, party_size_min, party_size_max) DO NOTHING;
                    END LOOP;
                END LOOP;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- Update restaurants with external booking providers (Resy, OpenTable)
UPDATE restaurants
SET
    reservation_provider = 'resy',
    reservation_provider_id = 'resy_' || restaurant_id::text,
    reservation_url = 'https://resy.com/cities/chicago/venues/' || restaurant_id::text
WHERE restaurant_id IN (
    SELECT restaurant_id FROM restaurants
    WHERE venue_type IN ('restaurant', 'fine_dining', 'bistro')
    ORDER BY RANDOM()
    LIMIT 5
);

UPDATE restaurants
SET
    reservation_provider = 'opentable',
    reservation_provider_id = 'ot_' || restaurant_id::text,
    reservation_url = 'https://www.opentable.com/restaurant/' || restaurant_id::text
WHERE restaurant_id IN (
    SELECT restaurant_id FROM restaurants
    WHERE venue_type IN ('restaurant', 'bistro', 'steakhouse')
    AND (reservation_provider IS NULL OR reservation_provider = 'internal')
    ORDER BY RANDOM()
    LIMIT 5
);

-- Set remaining to internal booking
UPDATE restaurants
SET reservation_provider = 'internal'
WHERE reservation_provider IS NULL;

-- Mark all restaurants as accepting reservations
UPDATE restaurants
SET accepts_reservations = true
WHERE accepts_reservations IS NULL;

-- Comment on what was done
SELECT 'Reservation slots seeded for 7 days, external providers assigned to restaurants' as result;
