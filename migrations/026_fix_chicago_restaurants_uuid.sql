-- Fix: 007 may fail on some servers due to invalid UUIDs (e.g. 'r' not valid hex).
-- This migration inserts all Chicago bars + restaurants with valid UUIDs.
-- Safe to run: ON CONFLICT DO NOTHING.

-- Chicago bars (same as 007, valid UUIDs only 0-9a-f)
INSERT INTO restaurants (restaurant_id, name, cuisine_type, venue_type, address, city, rating, price_range, latitude, longitude, photo_url, has_happy_hour, has_live_music, has_outdoor_seating) VALUES
('b1a2c3d4-e5f6-7890-abcd-ef1234567890', 'The Aviary', 'Cocktail Bar', 'bar', '955 W Fulton Market, Chicago, IL', 'Chicago', 4.7, '$$$$', 41.8869, -87.6520, 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b', true, false, false),
('b2a3c4d5-e6f7-8901-bcde-f23456789012', 'The Whistler', 'Cocktail Bar', 'bar', '2421 N Milwaukee Ave, Chicago, IL', 'Chicago', 4.5, '$$', 41.9256, -87.6959, 'https://images.unsplash.com/photo-1470337458703-46ad1756a187', true, true, false),
('b3a4c5d6-e7f8-9012-cdef-345678901234', 'Three Dots and a Dash', 'Tiki Bar', 'bar', '435 N Clark St, Chicago, IL', 'Chicago', 4.6, '$$$', 41.8902, -87.6314, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87', true, false, false),
('b4a5c6d7-e8f9-0123-defa-456789012345', 'Lost Lake', 'Tiki Bar', 'bar', '3154 W Diversey Ave, Chicago, IL', 'Chicago', 4.4, '$$', 41.9319, -87.7088, 'https://images.unsplash.com/photo-1544148103-0773bf10d330', true, false, false),
('b5a6c7d8-f9a0-1234-efab-567890123456', 'Rainbo Club', 'Dive Bar', 'bar', '1150 N Damen Ave, Chicago, IL', 'Chicago', 4.2, '$', 41.9028, -87.6772, 'https://images.unsplash.com/photo-1516994716711-3e1c62921e19', true, true, false),
('b6a7c8d9-f0a1-2345-fabc-678901234567', 'Beauty Bar', 'Nightclub', 'nightclub', '1444 W Chicago Ave, Chicago, IL', 'Chicago', 4.0, '$$', 41.8964, -87.6631, 'https://images.unsplash.com/photo-1566417713940-fe87186e17f5', true, true, false),
('b7a8c9d0-a1b2-3456-abcd-789012345678', 'Smart Bar', 'Nightclub', 'nightclub', '3730 N Clark St, Chicago, IL', 'Chicago', 4.3, '$$', 41.9494, -87.6599, 'https://images.unsplash.com/photo-1571266028243-e4733b0f0bb0', false, true, false),
('b8a9d1e2-a2b3-4567-bcde-890123456789', 'Bembe', 'Nightclub', 'nightclub', '2933 N Sheffield Ave, Chicago, IL', 'Chicago', 4.1, '$$', 41.9355, -87.6538, 'https://images.unsplash.com/photo-1574096079513-d8259312b785', true, true, false),
('b9a0d2e3-a3b4-5678-cdef-901234567890', 'Cindys Rooftop', 'Rooftop Bar', 'rooftop_bar', '12 S Michigan Ave, Chicago, IL', 'Chicago', 4.5, '$$$', 41.8816, -87.6248, 'https://images.unsplash.com/photo-1559339352-11d035aa65de', true, false, true),
('b0a1d3e4-a4b5-6789-defa-012345678901', 'Cerise Rooftop', 'Rooftop Bar', 'rooftop_bar', '203 N Wabash Ave, Chicago, IL', 'Chicago', 4.4, '$$$', 41.8868, -87.6262, 'https://images.unsplash.com/photo-1519677100203-a0e668c92439', true, false, true),
('c1a2d4e5-a5b6-7890-efab-123456789012', 'The Violet Hour', 'Speakeasy', 'speakeasy', '1520 N Damen Ave, Chicago, IL', 'Chicago', 4.6, '$$$', 41.9092, -87.6776, 'https://images.unsplash.com/photo-1560512823-8ea63d96f3f3', true, false, false),
('c2a3d5e6-a6b7-8901-fabc-234567890123', 'The Drifter', 'Speakeasy', 'speakeasy', '676 N Orleans St, Chicago, IL', 'Chicago', 4.5, '$$', 41.8943, -87.6375, 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34', true, true, false),
('c3a4d6e7-a7b8-9012-abcd-345678901234', 'Lazy Bird', 'Speakeasy', 'speakeasy', '1749 W Division St, Chicago, IL', 'Chicago', 4.3, '$$', 41.9033, -87.6728, 'https://images.unsplash.com/photo-1543007635-3508d90b2324', true, true, false),
('c4a5d7e8-a8b9-0123-bcde-456789012345', 'The Berkshire Room', 'Lounge', 'lounge', '15 E Ohio St, Chicago, IL', 'Chicago', 4.4, '$$$', 41.8927, -87.6281, 'https://images.unsplash.com/photo-1551024601-bec78aea704b', true, false, false),
('c5a6d8e9-a9b0-1234-cdef-567890123456', 'The Drawing Room', 'Lounge', 'lounge', '936 N Rush St, Chicago, IL', 'Chicago', 4.2, '$$', 41.9005, -87.6255, 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4', true, true, false)
ON CONFLICT (restaurant_id) DO NOTHING;

-- Chicago restaurants
INSERT INTO restaurants (restaurant_id, name, cuisine_type, venue_type, address, city, rating, price_range, latitude, longitude, photo_url) VALUES
('e1a2b3c4-d5e6-7890-abcd-ef1234567890', 'Alinea', 'Fine Dining', 'restaurant', '1723 N Halsted St, Chicago, IL', 'Chicago', 4.9, '$$$$$', 41.9133, -87.6482, 'https://images.unsplash.com/photo-1554118811-1e0d58224f24'),
('e2a3b4c5-e6f7-8901-bcde-f23456789012', 'Girl & Goat', 'Mediterranean', 'restaurant', '809 W Randolph St, Chicago, IL', 'Chicago', 4.7, '$$$', 41.8846, -87.6484, 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4'),
('e3a4b5c6-f8a9-0123-cdef-345678901234', 'Lou Malnatis', 'Pizza', 'restaurant', '439 N Wells St, Chicago, IL', 'Chicago', 4.5, '$$', 41.8904, -87.6344, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38'),
('e4a5b6c7-a8b9-2345-defa-456789012345', 'Portillos', 'Hot Dogs', 'restaurant', '100 W Ontario St, Chicago, IL', 'Chicago', 4.4, '$', 41.8935, -87.6314, 'https://images.unsplash.com/photo-1561758033-d8f2459b9b87'),
('e5a6b7c8-b9c0-3456-efab-567890123456', 'Gibsons Bar & Steakhouse', 'Steakhouse', 'restaurant', '1028 N Rush St, Chicago, IL', 'Chicago', 4.6, '$$$$', 41.9007, -87.6277, 'https://images.unsplash.com/photo-1544025162-d76694265947')
ON CONFLICT (restaurant_id) DO NOTHING;
