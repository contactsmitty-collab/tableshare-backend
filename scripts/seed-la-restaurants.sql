-- Seed Los Angeles restaurants and bars for LA test users
-- Uses only base columns (restaurant_id, name, address, city, cuisine_type, price_range, rating)
-- for DBs that have not run location/venue/events migrations.
-- Run: PGPASSWORD=postgres psql -h localhost -U postgres -d tableshare_dev -f scripts/seed-la-restaurants.sql
-- ON CONFLICT (restaurant_id) DO NOTHING so safe to run multiple times.

-- LA bars, lounges, rooftops
INSERT INTO restaurants (restaurant_id, name, address, city, cuisine_type, price_range, rating) VALUES
('a1b2c3d4-e5f6-4a01-8001-000000000001', 'The Rooftop at The Standard', '550 S Flower St, Los Angeles, CA', 'Los Angeles', 'Rooftop Bar', '$$$', 4.4),
('a1b2c3d4-e5f6-4a01-8001-000000000002', 'Spire 73', '645 W 5th St, Los Angeles, CA', 'Los Angeles', 'Rooftop Bar', '$$$$', 4.5),
('a1b2c3d4-e5f6-4a01-8001-000000000003', 'Upstairs at the Ace Hotel', '929 S Broadway, Los Angeles, CA', 'Los Angeles', 'Cocktail Bar', '$$', 4.3),
('a1b2c3d4-e5f6-4a01-8001-000000000004', 'The Edison', '108 W 2nd St, Los Angeles, CA', 'Los Angeles', 'Speakeasy', '$$$', 4.5),
('a1b2c3d4-e5f6-4a01-8001-000000000005', 'Good Times at Davey Waynes', '1611 N El Centro Ave, Los Angeles, CA', 'Los Angeles', 'Dive Bar', '$', 4.2),
('a1b2c3d4-e5f6-4a01-8001-000000000006', 'The Abbey', '692 N Robertson Blvd, West Hollywood, CA', 'Los Angeles', 'Nightclub', '$$', 4.1),
('a1b2c3d4-e5f6-4a01-8001-000000000007', 'The Nice Guy', '401 N La Cienega Blvd, West Hollywood, CA', 'Los Angeles', 'Lounge', '$$$$', 4.4),
('a1b2c3d4-e5f6-4a01-8001-000000000008', 'E.P. & L.P.', '603 N La Cienega Blvd, West Hollywood, CA', 'Los Angeles', 'Rooftop Bar', '$$$', 4.3),
('a1b2c3d4-e5f6-4a01-8001-000000000009', 'The Bungalow', '101 Wilshire Blvd, Santa Monica, CA', 'Los Angeles', 'Lounge', '$$$', 4.2),
('a1b2c3d4-e5f6-4a01-8001-00000000001a', 'High Rooftop Lounge', '929 S Broadway, Los Angeles, CA', 'Los Angeles', 'Rooftop Bar', '$$$', 4.3),
('a1b2c3d4-e5f6-4a01-8001-00000000001b', 'Bar Marmont', '8171 Sunset Blvd, West Hollywood, CA', 'Los Angeles', 'Cocktail Bar', '$$$', 4.4),
('a1b2c3d4-e5f6-4a01-8001-00000000001c', 'The Varnish', '118 E 6th St, Los Angeles, CA', 'Los Angeles', 'Speakeasy', '$$$', 4.6)
ON CONFLICT (restaurant_id) DO NOTHING;

-- LA restaurants
INSERT INTO restaurants (restaurant_id, name, address, city, cuisine_type, price_range, rating) VALUES
('a1b2c3d4-e5f6-4a01-8002-000000000001', 'Republique', '624 S La Brea Ave, Los Angeles, CA', 'Los Angeles', 'French', '$$$', 4.7),
('a1b2c3d4-e5f6-4a01-8002-000000000002', 'Bestia', '2121 E 7th Pl, Los Angeles, CA', 'Los Angeles', 'Italian', '$$$', 4.6),
('a1b2c3d4-e5f6-4a01-8002-000000000003', 'Sqirl', '720 N Virgil Ave, Los Angeles, CA', 'Los Angeles', 'American', '$$', 4.5),
('a1b2c3d4-e5f6-4a01-8002-000000000004', 'Guelaguetza', '3014 W Olympic Blvd, Los Angeles, CA', 'Los Angeles', 'Oaxacan', '$$', 4.6),
('a1b2c3d4-e5f6-4a01-8002-000000000005', 'Kogi BBQ', '3500 W Sunset Blvd, Los Angeles, CA', 'Los Angeles', 'Korean', '$', 4.4),
('a1b2c3d4-e5f6-4a01-8002-000000000006', 'Pizzana', '11712 San Vicente Blvd, Los Angeles, CA', 'Los Angeles', 'Pizza', '$$', 4.5),
('a1b2c3d4-e5f6-4a01-8002-000000000007', 'Sushi Gen', '422 E 2nd St, Los Angeles, CA', 'Los Angeles', 'Japanese', '$$$', 4.6),
('a1b2c3d4-e5f6-4a01-8002-000000000008', 'Grand Central Market', '317 S Broadway, Los Angeles, CA', 'Los Angeles', 'Food Hall', '$', 4.5),
('a1b2c3d4-e5f6-4a01-8002-000000000009', 'Jon & Vinny''s', '412 N Fairfax Ave, Los Angeles, CA', 'Los Angeles', 'Italian', '$$', 4.5),
('a1b2c3d4-e5f6-4a01-8002-00000000002a', 'Gjusta', '320 Sunset Ave, Venice, CA', 'Los Angeles', 'Mediterranean', '$$', 4.5),
('a1b2c3d4-e5f6-4a01-8002-00000000002b', 'Pine & Crane', '1521 Griffith Park Blvd, Los Angeles, CA', 'Los Angeles', 'Taiwanese', '$$', 4.5),
('a1b2c3d4-e5f6-4a01-8002-00000000002c', 'Gwen', '6600 Sunset Blvd, Los Angeles, CA', 'Los Angeles', 'Steakhouse', '$$$$', 4.6),
('a1b2c3d4-e5f6-4a01-8002-00000000002d', 'Majordomo', '1725 Naud St, Los Angeles, CA', 'Los Angeles', 'Asian', '$$$$', 4.6),
('a1b2c3d4-e5f6-4a01-8002-00000000002e', 'Bavel', '500 Mateo St, Los Angeles, CA', 'Los Angeles', 'Middle Eastern', '$$$', 4.6),
('a1b2c3d4-e5f6-4a01-8002-00000000002f', 'Cafe Gratitude', '512 Larchmont Blvd, Los Angeles, CA', 'Los Angeles', 'Vegetarian', '$$', 4.3),
('a1b2c3d4-e5f6-4a01-8002-000000000030', 'Howlin'' Ray''s', '727 N Broadway #128, Los Angeles, CA', 'Los Angeles', 'American', '$', 4.7),
('a1b2c3d4-e5f6-4a01-8002-000000000031', 'Night + Market Song', '3322 Sunset Blvd, Los Angeles, CA', 'Los Angeles', 'Thai', '$$', 4.5),
('a1b2c3d4-e5f6-4a01-8002-000000000032', 'Marugame Monzo', '329 E 1st St, Los Angeles, CA', 'Los Angeles', 'Japanese', '$$', 4.4),
('a1b2c3d4-e5f6-4a01-8002-000000000033', 'Connie & Ted''s', '8171 Santa Monica Blvd, West Hollywood, CA', 'Los Angeles', 'Seafood', '$$$', 4.4),
('a1b2c3d4-e5f6-4a01-8002-000000000034', 'Avec', '1000 S Santa Fe Ave, Los Angeles, CA', 'Los Angeles', 'Mediterranean', '$$$', 4.5)
ON CONFLICT (restaurant_id) DO NOTHING;
