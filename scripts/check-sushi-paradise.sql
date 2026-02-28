-- See all rows that look like Sushi Paradise (name or city might differ)
SELECT restaurant_id, name, city, address, cuisine_type
FROM restaurants
WHERE name ILIKE '%sushi%paradise%' OR name ILIKE '%sushi paradise%' OR (name ILIKE '%sushi%' AND address ILIKE '%broadway%')
ORDER BY name, city;
