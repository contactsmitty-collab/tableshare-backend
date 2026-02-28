-- Ensure restaurants.is_active exists (recommendation engine and fallbacks may reference it)
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

UPDATE restaurants SET is_active = true WHERE is_active IS NULL;

-- Fix generate_recommendations: CTEs must return columns matching RETURNS TABLE (overall_score, reason_description)
-- and use COALESCE so missing is_active does not break the function
CREATE OR REPLACE FUNCTION generate_recommendations(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    restaurant_id UUID,
    overall_score DECIMAL,
    reason_type VARCHAR,
    reason_description TEXT
) AS $$
DECLARE
    v_user_profile user_taste_profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_user_profile
    FROM user_taste_profiles
    WHERE user_id = p_user_id;

    IF v_user_profile IS NULL THEN
        PERFORM calculate_user_taste_profile(p_user_id);
        SELECT * INTO v_user_profile
        FROM user_taste_profiles
        WHERE user_id = p_user_id;
    END IF;

    RETURN QUERY
    WITH
    content_recs AS (
        SELECT
            r.restaurant_id,
            (CASE
                WHEN v_user_profile.cuisine_preferences->>r.cuisine_type IS NOT NULL
                THEN (v_user_profile.cuisine_preferences->>r.cuisine_type)::DECIMAL
                ELSE 0.3
            END)::DECIMAL AS overall_score,
            'taste_match'::VARCHAR AS reason_type,
            ('Matches your ' || COALESCE(r.cuisine_type, '') || ' preferences')::TEXT AS reason_description
        FROM restaurants r
        WHERE (r.is_active IS NULL OR r.is_active = true)
        AND NOT EXISTS (
            SELECT 1 FROM check_ins ci
            WHERE ci.user_id = p_user_id
            AND ci.restaurant_id = r.restaurant_id
        )
        ORDER BY overall_score DESC
        LIMIT GREATEST(1, p_limit / 2)
    ),
    collaborative_recs AS (
        SELECT
            r.restaurant_id,
            AVG(cri.interest_score)::DECIMAL AS overall_score,
            'similar_users'::VARCHAR AS reason_type,
            'Popular with diners like you'::TEXT AS reason_description
        FROM restaurants r
        JOIN user_restaurant_interactions cri ON r.restaurant_id = cri.restaurant_id
        JOIN user_segment_membership usm ON cri.user_id = usm.user_id
        WHERE usm.segment_id IN (
            SELECT segment_id FROM user_segment_membership
            WHERE user_id = p_user_id AND is_primary = true
        )
        AND cri.user_id != p_user_id
        AND cri.interest_score > 0.5
        AND NOT EXISTS (
            SELECT 1 FROM check_ins ci
            WHERE ci.user_id = p_user_id
            AND ci.restaurant_id = r.restaurant_id
        )
        GROUP BY r.restaurant_id
        ORDER BY overall_score DESC
        LIMIT GREATEST(0, p_limit / 4)
    ),
    trending_recs AS (
        SELECT
            tr.restaurant_id,
            tr.trending_score::DECIMAL AS overall_score,
            'trending'::VARCHAR AS reason_type,
            ('Trending now in ' || COALESCE(r.city, ''))::TEXT AS reason_description
        FROM trending_restaurants tr
        JOIN restaurants r ON tr.restaurant_id = r.restaurant_id
        WHERE tr.trending_score > 0.6
        AND NOT EXISTS (
            SELECT 1 FROM check_ins ci
            WHERE ci.user_id = p_user_id
            AND ci.restaurant_id = tr.restaurant_id
        )
        ORDER BY overall_score DESC
        LIMIT GREATEST(0, p_limit / 4)
    )
    SELECT * FROM content_recs
    UNION ALL
    SELECT * FROM collaborative_recs
    UNION ALL
    SELECT * FROM trending_recs
    ORDER BY overall_score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
