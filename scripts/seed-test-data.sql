-- Seed test data for Alice's account
-- Run: PGPASSWORD=tableshare_secure_pass_2026 psql -h localhost -U tableshare_user -d tableshare_prod -f scripts/seed-test-data.sql

-- First, get Alice's user_id
DO $$
DECLARE
  alice_id UUID;
  bob_id UUID;
  carol_id UUID;
  dave_id UUID;
  rest1_id UUID;
  rest2_id UUID;
  rest3_id UUID;
  rest4_id UUID;
BEGIN

  -- Get Alice's ID
  SELECT user_id INTO alice_id FROM users WHERE first_name = 'Alice' LIMIT 1;
  IF alice_id IS NULL THEN
    RAISE NOTICE 'Alice not found! Skipping.';
    RETURN;
  END IF;
  RAISE NOTICE 'Found Alice: %', alice_id;

  -- Create test users if they don't exist
  INSERT INTO users (first_name, last_name, email, password_hash, bio, occupation, date_of_birth)
  VALUES ('Bob', 'Martinez', 'bob@test.com', '$2b$10$dummyhashforseeding123456789012345678', 'Food lover and weekend chef. Always looking for the best tacos in town.', 'Software Engineer', '1992-05-15')
  ON CONFLICT (email) DO NOTHING;
  SELECT user_id INTO bob_id FROM users WHERE email = 'bob@test.com';

  INSERT INTO users (first_name, last_name, email, password_hash, bio, occupation, date_of_birth)
  VALUES ('Carol', 'Chen', 'carol@test.com', '$2b$10$dummyhashforseeding123456789012345678', 'Wine enthusiast and sushi connoisseur. Love trying new restaurants!', 'Marketing Manager', '1990-08-22')
  ON CONFLICT (email) DO NOTHING;
  SELECT user_id INTO carol_id FROM users WHERE email = 'carol@test.com';

  INSERT INTO users (first_name, last_name, email, password_hash, bio, occupation, date_of_birth)
  VALUES ('Dave', 'Wilson', 'dave@test.com', '$2b$10$dummyhashforseeding123456789012345678', 'Brunch king. Ask me about the best eggs benedict in the city.', 'Photographer', '1988-12-03')
  ON CONFLICT (email) DO NOTHING;
  SELECT user_id INTO dave_id FROM users WHERE email = 'dave@test.com';

  RAISE NOTICE 'Test users ready: Bob=%, Carol=%, Dave=%', bob_id, carol_id, dave_id;

  -- Get some restaurant IDs
  SELECT restaurant_id INTO rest1_id FROM restaurants ORDER BY restaurant_id LIMIT 1;
  SELECT restaurant_id INTO rest2_id FROM restaurants ORDER BY restaurant_id LIMIT 1 OFFSET 1;
  SELECT restaurant_id INTO rest3_id FROM restaurants ORDER BY restaurant_id LIMIT 1 OFFSET 2;
  SELECT restaurant_id INTO rest4_id FROM restaurants ORDER BY restaurant_id LIMIT 1 OFFSET 3;

  IF rest1_id IS NULL THEN
    RAISE NOTICE 'No restaurants found! Skipping check-ins and matches.';
    RETURN;
  END IF;

  RAISE NOTICE 'Using restaurants: %, %, %, %', rest1_id, rest2_id, rest3_id, rest4_id;

  -- Create check-ins for test users (so they show as active at restaurants)
  INSERT INTO check_ins (user_id, restaurant_id, party_size, notes, is_active, check_in_time)
  VALUES
    (bob_id, rest1_id, 2, 'Great vibe tonight!', true, NOW() - INTERVAL '30 minutes'),
    (carol_id, rest1_id, 1, 'Solo dinner, open to meeting people', true, NOW() - INTERVAL '15 minutes'),
    (dave_id, rest2_id, 3, 'Birthday dinner!', true, NOW() - INTERVAL '45 minutes')
  ON CONFLICT DO NOTHING;

  -- Create pending match requests TO Alice (so she sees incoming requests)
  INSERT INTO matches (requester_id, receiver_id, restaurant_id, status, created_at)
  VALUES
    (bob_id, alice_id, rest1_id, 'pending', NOW() - INTERVAL '10 minutes'),
    (carol_id, alice_id, rest1_id, 'pending', NOW() - INTERVAL '5 minutes')
  ON CONFLICT DO NOTHING;

  -- Create an accepted match for Alice
  INSERT INTO matches (requester_id, receiver_id, restaurant_id, status, created_at)
  VALUES
    (dave_id, alice_id, rest2_id, 'accepted', NOW() - INTERVAL '2 hours')
  ON CONFLICT DO NOTHING;

  -- Create a match request FROM Alice (outgoing)
  INSERT INTO matches (requester_id, receiver_id, restaurant_id, status, created_at)
  VALUES
    (alice_id, dave_id, rest3_id, 'pending', NOW() - INTERVAL '1 hour')
  ON CONFLICT DO NOTHING;

  -- Add some check-ins for Alice
  INSERT INTO check_ins (user_id, restaurant_id, party_size, notes, is_active, check_in_time)
  VALUES
    (alice_id, rest1_id, 2, 'Amazing pasta!', false, NOW() - INTERVAL '3 days'),
    (alice_id, rest2_id, 4, 'Group dinner with friends', false, NOW() - INTERVAL '1 week'),
    (alice_id, rest3_id, 1, 'Quick lunch', false, NOW() - INTERVAL '2 weeks')
  ON CONFLICT DO NOTHING;

  -- Create a dining group with Alice as member
  INSERT INTO dining_groups (group_name, created_by, invite_code, description)
  VALUES ('Friday Night Foodies', bob_id, 'FNF001', 'Weekly restaurant exploration group')
  ON CONFLICT DO NOTHING;

  -- Add members to the group
  INSERT INTO group_members (group_id, user_id)
  SELECT dg.group_id, bob_id FROM dining_groups dg WHERE dg.group_name = 'Friday Night Foodies'
  ON CONFLICT DO NOTHING;
  INSERT INTO group_members (group_id, user_id)
  SELECT dg.group_id, alice_id FROM dining_groups dg WHERE dg.group_name = 'Friday Night Foodies'
  ON CONFLICT DO NOTHING;
  INSERT INTO group_members (group_id, user_id)
  SELECT dg.group_id, carol_id FROM dining_groups dg WHERE dg.group_name = 'Friday Night Foodies'
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ Test data seeded successfully for Alice!';
  RAISE NOTICE '   - 3 test users created (Bob, Carol, Dave)';
  RAISE NOTICE '   - 2 pending match requests TO Alice';
  RAISE NOTICE '   - 1 accepted match for Alice';
  RAISE NOTICE '   - 1 outgoing match request FROM Alice';
  RAISE NOTICE '   - 3 historical check-ins for Alice';
  RAISE NOTICE '   - 1 dining group with Alice as member';

END $$;
