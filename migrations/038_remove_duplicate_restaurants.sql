-- Remove duplicate restaurants (same name + city) so each venue appears once (e.g. The Aviary in Group Dining).
-- Updates dining_groups.restaurant_id and dining_groups.checked_in_restaurant_id (if column exists), then deletes duplicate restaurant rows.

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

    UPDATE dining_groups SET restaurant_id = kept_id
    WHERE restaurant_id IN (
      SELECT restaurant_id FROM restaurants
      WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id
    );

    BEGIN
      UPDATE dining_groups SET checked_in_restaurant_id = kept_id
      WHERE checked_in_restaurant_id IN (
        SELECT restaurant_id FROM restaurants
        WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id
      );
    EXCEPTION WHEN undefined_column THEN NULL;
    END;

    UPDATE check_ins SET restaurant_id = kept_id
    WHERE restaurant_id IN (
      SELECT restaurant_id FROM restaurants
      WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id
    );

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

    DELETE FROM restaurants
    WHERE LOWER(TRIM(name)) = nname AND LOWER(TRIM(COALESCE(city, ''))) = ncity AND restaurant_id != kept_id;
  END LOOP;
END $$;
