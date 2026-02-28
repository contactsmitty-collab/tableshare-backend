-- Remove duplicate restaurants: same name + city (case- and whitespace-insensitive).
-- Run: PGPASSWORD=postgres psql -h localhost -U postgres -d tableshare_dev -f scripts/remove-duplicate-restaurants.sql
--
-- Groups by LOWER(TRIM(name)) and LOWER(TRIM(COALESCE(city,''))) so "Sushi Paradise"/"sushi paradise"
-- and "New York"/"new york" are treated as the same. Keeps one row per group, updates refs, deletes the rest.

DO $$
DECLARE
  r RECORD;
  kept_id UUID;
  nname TEXT;
  ncity TEXT;
BEGIN
  FOR r IN (
    SELECT
      (array_agg(restaurant_id ORDER BY restaurant_id))[1] AS keep_id,
      LOWER(TRIM(name)) AS name_norm,
      LOWER(TRIM(COALESCE(city, ''))) AS city_norm
    FROM restaurants
    GROUP BY LOWER(TRIM(name)), LOWER(TRIM(COALESCE(city, '')))
    HAVING COUNT(*) > 1
  )
  LOOP
    kept_id := r.keep_id;
    nname := r.name_norm;
    ncity := r.city_norm;
    RAISE NOTICE 'Deduplicating group name_norm=%, city_norm=%, keeping %', nname, ncity, kept_id;

    -- Point references to the kept restaurant (match by normalized name/city)
    BEGIN
      UPDATE check_ins SET restaurant_id = kept_id
      WHERE restaurant_id IN (
        SELECT restaurant_id FROM restaurants
        WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id
      );
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    BEGIN
      UPDATE matches SET restaurant_id = kept_id
      WHERE restaurant_id IN (
        SELECT restaurant_id FROM restaurants
        WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id
      );
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    BEGIN
      UPDATE dining_list_entries SET restaurant_id = kept_id
      WHERE restaurant_id IN (
        SELECT restaurant_id FROM restaurants
        WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id
      );
      DELETE FROM dining_list_entries a USING dining_list_entries b
        WHERE a.list_id = b.list_id AND a.restaurant_id = b.restaurant_id AND a.ctid < b.ctid;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    BEGIN
      UPDATE table_alerts SET restaurant_id = kept_id
      WHERE restaurant_id IN (
        SELECT restaurant_id FROM restaurants
        WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id
      );
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    BEGIN
      UPDATE recommendation_cache SET restaurant_id = kept_id
      WHERE restaurant_id IN (
        SELECT restaurant_id FROM restaurants
        WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id
      );
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    BEGIN
      UPDATE user_restaurant_interactions SET restaurant_id = kept_id
      WHERE restaurant_id IN (
        SELECT restaurant_id FROM restaurants
        WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id
      );
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    -- Delete duplicate restaurant rows
    DELETE FROM restaurants
    WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id;
    RAISE NOTICE '  Deleted duplicates.';
  END LOOP;
END $$;
