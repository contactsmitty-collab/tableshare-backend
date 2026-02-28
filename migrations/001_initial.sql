CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  date_of_birth DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS restaurants (
  restaurant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address VARCHAR(500),
  city VARCHAR(100),
  cuisine_type VARCHAR(100),
  price_range VARCHAR(10),
  rating DECIMAL(3,2) DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert only if not already present (avoids duplicates when migration is re-run)
INSERT INTO restaurants (name, address, city, cuisine_type, price_range, rating)
SELECT * FROM (VALUES
  ('Italian Kitchen', '123 Main St', 'New York', 'Italian', '$$', 4.5),
  ('Sushi Paradise', '456 Broadway', 'New York', 'Japanese', '$$$', 4.7),
  ('American Diner', '789 5th Ave', 'New York', 'American', '$', 4.2)
) AS v(name, address, city, cuisine_type, price_range, rating)
WHERE NOT EXISTS (SELECT 1 FROM restaurants r WHERE r.name = v.name AND r.city = v.city);
