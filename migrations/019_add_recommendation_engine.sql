-- Migration: Add AI-Powered Recommendation Engine
-- Created: 2026-02-23

-- User taste profiles (learned preferences)
CREATE TABLE IF NOT EXISTS user_taste_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Cuisine preferences (JSON for flexibility)
    cuisine_preferences JSONB DEFAULT '{}', -- { "Italian": 0.85, "Japanese": 0.72, ... }
    cuisine_exploration_score DECIMAL(4,3) DEFAULT 0.5, -- 0-1, how adventurous
    
    -- Price range preference
    preferred_price_range INTEGER DEFAULT 2, -- 1-4 scale
    price_flexibility DECIMAL(4,3) DEFAULT 0.3, -- how flexible on price
    
    -- Ambiance preferences
    ambiance_preferences JSONB DEFAULT '{}', -- { "lively": 0.8, "quiet": 0.3, ... }
    
    -- Dining style
    preferred_dining_style VARCHAR(50), -- 'quick', 'casual', 'fine_dining', 'social'
    
    -- Temporal patterns
    preferred_days JSONB DEFAULT '[]', -- [1, 5, 6] for Mon, Fri, Sat
    preferred_times JSONB DEFAULT '{}', -- { "lunch": 0.6, "dinner": 0.9 }
    
    -- Dietary considerations
    dietary_restrictions TEXT[],
    
    -- Social preferences
    preferred_party_size INTEGER DEFAULT 2,
    social_preference VARCHAR(50) DEFAULT 'flexible', -- 'solo', 'couple', 'group', 'flexible'
    
    -- Location preferences
    preferred_distance_minutes INTEGER DEFAULT 30, -- max travel time
    preferred_neighborhoods TEXT[],
    
    -- Confidence score (how well we know this user)
    profile_confidence DECIMAL(4,3) DEFAULT 0.1,
    profile_completeness INTEGER DEFAULT 0, -- 0-100%
    
    -- Last update tracking
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- ML features (REAL[] avoids requiring pgvector extension)
    vector_embedding REAL[], -- For similarity matching, e.g. 128 dimensions
    cluster_id INTEGER -- User segment cluster
);

-- User-restaurant interaction matrix (for collaborative filtering)
CREATE TABLE IF NOT EXISTS user_restaurant_interactions (
    interaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    
    -- Interaction types with weights
    viewed BOOLEAN DEFAULT false,
    viewed_at TIMESTAMP WITH TIME ZONE,
    view_duration_seconds INTEGER, -- how long they looked
    
    checked_in BOOLEAN DEFAULT false,
    check_in_id UUID REFERENCES check_ins(check_in_id) ON DELETE SET NULL,
    
    favorited BOOLEAN DEFAULT false,
    favorited_at TIMESTAMP WITH TIME ZONE,
    
    rated BOOLEAN DEFAULT false,
    rating_id UUID REFERENCES ratings(rating_id) ON DELETE SET NULL,
    rating_value INTEGER, -- 1-5
    
    matched_at BOOLEAN DEFAULT false, -- matched with someone here
    
    -- Calculated interest score (0-1)
    interest_score DECIMAL(4,3) DEFAULT 0,
    
    -- Context
    context_tags TEXT[], -- ['lunch', 'weekend', 'group', 'date_night']
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (user_id, restaurant_id)
);

-- Recommendation cache (pre-computed recommendations)
CREATE TABLE IF NOT EXISTS recommendation_cache (
    cache_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Recommendation type
    recommendation_type VARCHAR(50) NOT NULL, -- 'for_you', 'similar_users', 'trending', 'explore'
    
    -- Recommended restaurant
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    
    -- Scoring
    overall_score DECIMAL(5,4) NOT NULL, -- 0-1
    collaborative_score DECIMAL(5,4), -- similarity to users like you
    content_score DECIMAL(5,4), -- match to your taste profile
    popularity_score DECIMAL(5,4), -- general popularity
    recency_score DECIMAL(5,4), -- newness factor
    distance_score DECIMAL(5,4), -- proximity bonus
    
    -- Reasoning for explainability
    reason_type VARCHAR(50), -- 'similar_users', 'taste_match', 'trending', 'new_in_area', 'complete_profile'
    reason_description TEXT, -- "Because you liked Italian restaurants"
    
    -- Position in feed
    display_position INTEGER,
    
    -- User feedback
    shown_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    dismissed BOOLEAN DEFAULT false,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    
    -- Validity
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',
    
    UNIQUE (user_id, recommendation_type, restaurant_id)
);

-- Restaurant similarity matrix (content-based filtering)
CREATE TABLE IF NOT EXISTS restaurant_similarity (
    similarity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_a_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    restaurant_b_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    
    similarity_score DECIMAL(5,4) NOT NULL, -- 0-1
    similarity_factors JSONB, -- { "cuisine": 0.8, "price": 0.6, "ambiance": 0.7 }
    
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (restaurant_a_id, restaurant_b_id),
    CHECK (restaurant_a_id < restaurant_b_id) -- Avoid duplicates
);

-- Trending restaurants (real-time popularity)
CREATE TABLE IF NOT EXISTS trending_restaurants (
    trending_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL UNIQUE REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    
    -- Trending metrics
    checkin_velocity DECIMAL(10,2), -- checkins per hour in last 24h
    checkin_acceleration DECIMAL(10,2), -- rate of change
    unique_visitors_24h INTEGER,
    unique_visitors_7d INTEGER,
    
    -- Engagement metrics
    match_rate DECIMAL(5,4), -- % of checkins that led to matches
    avg_rating_recent DECIMAL(3,2), -- avg rating in last 7 days
    photo_upload_rate DECIMAL(5,4), -- % of checkins with photos
    
    -- Trending score (calculated)
    trending_score DECIMAL(5,4),
    trend_direction VARCHAR(20), -- 'rising', 'stable', 'falling', 'hot'
    
    -- Ranking
    global_rank INTEGER,
    city_rank INTEGER,
    cuisine_rank INTEGER,
    
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Peak time prediction
    predicted_peak_hour INTEGER, -- 0-23
    predicted_peak_day INTEGER -- 0-6 (Sun-Sat)
);

-- User segments (clustering for collaborative filtering)
CREATE TABLE IF NOT EXISTS user_segments (
    segment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Segment characteristics
    segment_name VARCHAR(100) NOT NULL,
    segment_description TEXT,
    
    -- Centroid vector (average taste profile)
    centroid_vector REAL[],
    
    -- Characteristics
    dominant_cuisines TEXT[],
    avg_price_preference DECIMAL(3,2),
    avg_exploration_score DECIMAL(4,3),
    preferred_dining_styles TEXT[],
    
    -- Size
    user_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User segment membership
CREATE TABLE IF NOT EXISTS user_segment_membership (
    membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    segment_id UUID NOT NULL REFERENCES user_segments(segment_id) ON DELETE CASCADE,
    
    membership_score DECIMAL(5,4), -- how strongly they belong (0-1)
    is_primary BOOLEAN DEFAULT false,
    
    UNIQUE (user_id, segment_id)
);

-- "For You" feed items (aggregated recommendations)
CREATE TABLE IF NOT EXISTS for_you_feed (
    feed_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Feed item
    item_type VARCHAR(50) NOT NULL, -- 'restaurant', 'challenge', 'event', 'social'
    item_id UUID NOT NULL, -- references restaurant_id, challenge_id, etc.
    
    -- Content
    title VARCHAR(200),
    subtitle TEXT,
    image_url VARCHAR(500),
    
    -- Scoring
    relevance_score DECIMAL(5,4) NOT NULL,
    freshness_score DECIMAL(5,4), -- how new is this content
    
    -- Reasoning
    reason_type VARCHAR(50),
    reason_text TEXT, -- "Because you love Italian food"
    
    -- Display
    display_order INTEGER,
    
    -- Interaction tracking
    shown_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    dismissed BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_taste_profiles_user ON user_taste_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_taste_profiles_cluster ON user_taste_profiles(cluster_id);
CREATE INDEX IF NOT EXISTS idx_user_restaurant_interactions_user ON user_restaurant_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_restaurant_interactions_restaurant ON user_restaurant_interactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_user_restaurant_interactions_score ON user_restaurant_interactions(interest_score);
CREATE INDEX IF NOT EXISTS idx_recommendation_cache_user ON recommendation_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_cache_type ON recommendation_cache(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_recommendation_cache_score ON recommendation_cache(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_cache_expires ON recommendation_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_restaurant_similarity_a ON restaurant_similarity(restaurant_a_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_similarity_b ON restaurant_similarity(restaurant_b_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_similarity_score ON restaurant_similarity(similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_trending_restaurants_score ON trending_restaurants(trending_score DESC);
CREATE INDEX IF NOT EXISTS idx_trending_restaurants_city ON trending_restaurants(city_rank);
CREATE INDEX IF NOT EXISTS idx_for_you_feed_user ON for_you_feed(user_id);
CREATE INDEX IF NOT EXISTS idx_for_you_feed_score ON for_you_feed(relevance_score DESC);

-- Views

-- User recommendations view (combines cache with live data)
CREATE OR REPLACE VIEW user_recommendations AS
SELECT 
    rc.*,
    r.name as restaurant_name,
    r.photo_url as restaurant_photo,
    r.cuisine_type,
    r.price_range,
    r.rating as restaurant_rating,
    r.address,
    r.city,
    r.latitude,
    r.longitude,
    EXISTS(
        SELECT 1 FROM check_ins ci 
        WHERE ci.user_id = rc.user_id 
        AND ci.restaurant_id = rc.restaurant_id
    ) as user_has_visited
FROM recommendation_cache rc
JOIN restaurants r ON rc.restaurant_id = r.restaurant_id
WHERE rc.expires_at > NOW()
AND rc.dismissed = false;

-- Similar restaurants view
CREATE OR REPLACE VIEW similar_restaurants_view AS
SELECT 
    rs.*,
    ra.name as restaurant_a_name,
    ra.photo_url as restaurant_a_photo,
    rb.name as restaurant_b_name,
    rb.photo_url as restaurant_b_photo,
    ra.cuisine_type as restaurant_a_cuisine,
    rb.cuisine_type as restaurant_b_cuisine
FROM restaurant_similarity rs
JOIN restaurants ra ON rs.restaurant_a_id = ra.restaurant_id
JOIN restaurants rb ON rs.restaurant_b_id = rb.restaurant_id
WHERE rs.similarity_score > 0.6;

-- Functions

-- Calculate user taste profile from interactions
CREATE OR REPLACE FUNCTION calculate_user_taste_profile(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_checkins INTEGER;
    v_cuisine_counts JSONB;
    v_avg_rating DECIMAL;
    v_price_counts JSONB;
BEGIN
    -- Count checkins by cuisine (use subquery to avoid nested aggregates)
    SELECT 
        COALESCE(jsonb_object_agg(cuisine_counts.cuisine, cuisine_counts.cnt), '{}'),
        COALESCE(SUM(cuisine_counts.cnt), 0)
    INTO v_cuisine_counts, v_total_checkins
    FROM (
        SELECT COALESCE(r.cuisine_type, 'Unknown') as cuisine, COUNT(*) as cnt
        FROM check_ins ci
        JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
        WHERE ci.user_id = p_user_id
        GROUP BY r.cuisine_type
    ) cuisine_counts;
    
    -- Calculate cuisine preferences (normalized)
    IF v_total_checkins > 0 THEN
        SELECT jsonb_object_agg(
            cuisine,
            (count::DECIMAL / v_total_checkins)
        )
        INTO v_cuisine_counts
        FROM jsonb_each_text(v_cuisine_counts) AS t(cuisine, count);
    END IF;
    
    -- Get average rating given
    SELECT AVG(rating) INTO v_avg_rating
    FROM ratings
    WHERE user_id = p_user_id;
    
    -- Update or insert taste profile
    INSERT INTO user_taste_profiles (
        user_id,
        cuisine_preferences,
        cuisine_exploration_score,
        profile_confidence,
        last_updated_at
    )
    VALUES (
        p_user_id,
        COALESCE(v_cuisine_counts, '{}'),
        LEAST(1.0, v_total_checkins::DECIMAL / 20), -- More visits = more adventurous
        LEAST(1.0, v_total_checkins::DECIMAL / 10),
        NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
        cuisine_preferences = EXCLUDED.cuisine_preferences,
        cuisine_exploration_score = EXCLUDED.cuisine_exploration_score,
        profile_confidence = EXCLUDED.profile_confidence,
        last_updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Generate recommendations for a user
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
    v_user_vector JSONB;
BEGIN
    -- Get user profile
    SELECT * INTO v_user_profile
    FROM user_taste_profiles
    WHERE user_id = p_user_id;
    
    -- If no profile, create one
    IF v_user_profile IS NULL THEN
        PERFORM calculate_user_taste_profile(p_user_id);
        SELECT * INTO v_user_profile
        FROM user_taste_profiles
        WHERE user_id = p_user_id;
    END IF;
    
    -- Return diverse recommendations combining different signals
    RETURN QUERY
    WITH 
    -- Content-based: match to taste profile
    content_recs AS (
        SELECT 
            r.restaurant_id,
            CASE 
                WHEN v_user_profile.cuisine_preferences->>r.cuisine_type IS NOT NULL 
                THEN (v_user_profile.cuisine_preferences->>r.cuisine_type)::DECIMAL
                ELSE 0.3
            END as content_score,
            'taste_match' as reason_type,
            'Matches your ' || r.cuisine_type || ' preferences' as reason_desc
        FROM restaurants r
        WHERE r.is_active = true
        AND NOT EXISTS (
            SELECT 1 FROM check_ins ci 
            WHERE ci.user_id = p_user_id 
            AND ci.restaurant_id = r.restaurant_id
        )
        ORDER BY content_score DESC
        LIMIT p_limit / 2
    ),
    -- Collaborative: what similar users like
    collaborative_recs AS (
        SELECT 
            r.restaurant_id,
            AVG(cri.interest_score) as collab_score,
            'similar_users' as reason_type,
            'Popular with diners like you' as reason_desc
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
        ORDER BY collab_score DESC
        LIMIT p_limit / 4
    ),
    -- Trending: hot right now
    trending_recs AS (
        SELECT 
            tr.restaurant_id,
            tr.trending_score as trend_score,
            'trending' as reason_type,
            'Trending now in ' || r.city as reason_desc
        FROM trending_restaurants tr
        JOIN restaurants r ON tr.restaurant_id = r.restaurant_id
        WHERE tr.trending_score > 0.6
        AND NOT EXISTS (
            SELECT 1 FROM check_ins ci 
            WHERE ci.user_id = p_user_id 
            AND ci.restaurant_id = tr.restaurant_id
        )
        ORDER BY tr.trending_score DESC
        LIMIT p_limit / 4
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

-- Calculate trending scores
CREATE OR REPLACE FUNCTION update_trending_restaurants()
RETURNS VOID AS $$
BEGIN
    -- Clear old data
    DELETE FROM trending_restaurants 
    WHERE computed_at < NOW() - INTERVAL '1 hour';
    
    -- Calculate new trending scores
    INSERT INTO trending_restaurants (
        restaurant_id,
        checkin_velocity,
        checkin_acceleration,
        unique_visitors_24h,
        unique_visitors_7d,
        trending_score,
        trend_direction,
        computed_at
    )
    SELECT 
        r.restaurant_id,
        COUNT(CASE WHEN ci.check_in_time > NOW() - INTERVAL '24 hours' THEN 1 END)::DECIMAL / 24 as velocity,
        0, -- acceleration calculated separately
        COUNT(DISTINCT CASE WHEN ci.check_in_time > NOW() - INTERVAL '24 hours' THEN ci.user_id END),
        COUNT(DISTINCT CASE WHEN ci.check_in_time > NOW() - INTERVAL '7 days' THEN ci.user_id END),
        -- Composite trending score
        (
            COUNT(CASE WHEN ci.check_in_time > NOW() - INTERVAL '24 hours' THEN 1 END)::DECIMAL * 0.4 +
            COUNT(DISTINCT CASE WHEN ci.check_in_time > NOW() - INTERVAL '24 hours' THEN ci.user_id END)::DECIMAL * 0.3 +
            AVG(CASE WHEN ci.check_in_time > NOW() - INTERVAL '7 days' THEN 4 ELSE 0 END) * 0.3
        ) / 100,
        'stable',
        NOW()
    FROM restaurants r
    LEFT JOIN check_ins ci ON r.restaurant_id = ci.restaurant_id
    WHERE ci.check_in_time > NOW() - INTERVAL '7 days'
    GROUP BY r.restaurant_id
    HAVING COUNT(CASE WHEN ci.check_in_time > NOW() - INTERVAL '24 hours' THEN 1 END) > 0
    ORDER BY 6 DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE user_taste_profiles IS 'ML-generated user preference profiles';
COMMENT ON TABLE user_restaurant_interactions IS 'User-restaurant interaction history for collaborative filtering';
COMMENT ON TABLE recommendation_cache IS 'Pre-computed personalized recommendations';
COMMENT ON TABLE restaurant_similarity IS 'Content-based similarity between restaurants';
COMMENT ON TABLE trending_restaurants IS 'Real-time trending restaurant rankings';
COMMENT ON TABLE for_you_feed IS 'Personalized feed items for each user';
