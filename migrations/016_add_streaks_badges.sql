-- Migration: Add Check-in Streaks & Badges System
-- Created: 2026-02-22

-- Streak tracking table
CREATE TABLE IF NOT EXISTS checkin_streaks (
    streak_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Streak data
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_checkin_date DATE,
    streak_start_date DATE,
    
    -- Metadata
    total_checkins INTEGER DEFAULT 0,
    total_restaurants_visited INTEGER DEFAULT 0,
    unique_cuisines INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (user_id)
);

-- Badge definitions table
CREATE TABLE IF NOT EXISTS badge_definitions (
    badge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_code VARCHAR(50) UNIQUE NOT NULL, -- 'streak_7', 'explorer_10', 'social_butterfly'
    
    -- Badge info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    icon_emoji VARCHAR(10), -- Alternative to URL
    
    -- Category and tier
    category VARCHAR(50), -- 'streak', 'explorer', 'social', 'foodie', 'nightlife'
    tier INTEGER DEFAULT 1, -- 1=bronze, 2=silver, 3=gold, 4=platinum
    
    -- Requirements
    requirement_type VARCHAR(50), -- 'streak_days', 'total_checkins', 'unique_venues', 'cuisines', 'matches'
    requirement_value INTEGER DEFAULT 1,
    
    -- Display
    color_hex VARCHAR(7) DEFAULT '#FFD700', -- Gold default
    animation_type VARCHAR(50), -- 'sparkle', 'pulse', 'rotate'
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User earned badges table
CREATE TABLE IF NOT EXISTS user_badges (
    user_badge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badge_definitions(badge_id) ON DELETE CASCADE,
    
    -- Progress tracking (for multi-tier badges)
    progress_current INTEGER DEFAULT 1,
    progress_target INTEGER DEFAULT 1,
    
    -- Status
    is_new BOOLEAN DEFAULT true, -- For "new badge" notifications
    viewed_at TIMESTAMP WITH TIME ZONE,
    
    -- When earned
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (user_id, badge_id)
);

-- Streak history log (for analytics and recovery)
CREATE TABLE IF NOT EXISTS streak_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    streak_date DATE NOT NULL,
    checkin_count INTEGER DEFAULT 1,
    streak_number INTEGER NOT NULL,
    
    -- Was streak maintained or broken?
    streak_status VARCHAR(20) DEFAULT 'active', -- 'active', 'broken', 'restored'
    broken_reason TEXT, -- Why streak broke (optional)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_checkin_streaks_user_id ON checkin_streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_streak_history_user_id ON streak_history(user_id);
CREATE INDEX IF NOT EXISTS idx_streak_history_date ON streak_history(streak_date);

-- Seed badge definitions
INSERT INTO badge_definitions (badge_code, name, description, icon_emoji, category, tier, requirement_type, requirement_value, color_hex) VALUES
-- Streak badges
('streak_3', 'Week Warrior', 'Checked in 3 days in a row', '🔥', 'streak', 1, 'streak_days', 3, '#CD7F32'),
('streak_7', 'Week Streaker', '7-day check-in streak', '🔥', 'streak', 2, 'streak_days', 7, '#C0C0C0'),
('streak_30', 'Monthly Master', '30-day check-in streak', '🔥', 'streak', 3, 'streak_days', 30, '#FFD700'),
('streak_100', 'Centurion', '100-day check-in streak', '🔥', 'streak', 4, 'streak_days', 100, '#E5E4E2'),

-- Explorer badges
('explorer_5', 'Local Explorer', 'Visited 5 different restaurants', '🗺️', 'explorer', 1, 'unique_venues', 5, '#CD7F32'),
('explorer_25', 'City Scout', 'Visited 25 different restaurants', '🗺️', 'explorer', 2, 'unique_venues', 25, '#C0C0C0'),
('explorer_100', 'Urban Explorer', 'Visited 100 different restaurants', '🗺️', 'explorer', 3, 'unique_venues', 100, '#FFD700'),

-- Foodie badges
('foodie_3', 'Taste Tester', 'Tried 3 different cuisines', '🍽️', 'foodie', 1, 'cuisines', 3, '#CD7F32'),
('foodie_10', 'Cuisine Collector', 'Tried 10 different cuisines', '🍽️', 'foodie', 2, 'cuisines', 10, '#C0C0C0'),
('foodie_20', 'Global Gourmand', 'Tried 20 different cuisines', '🍽️', 'foodie', 3, 'cuisines', 20, '#FFD700'),

-- Social badges
('social_1', 'First Match', 'Made your first dining match', '🤝', 'social', 1, 'matches', 1, '#CD7F32'),
('social_10', 'Social Diner', '10 successful dining matches', '🤝', 'social', 2, 'matches', 10, '#C0C0C0'),
('social_50', 'Community Builder', '50 successful dining matches', '🤝', 'social', 3, 'matches', 50, '#FFD700'),

-- Nightlife badges
('nightlife_5', 'Night Owl', 'Checked in at 5 bars/clubs', '🦉', 'nightlife', 1, 'nightlife_checkins', 5, '#CD7F32'),
('nightlife_25', 'Party Animal', 'Checked in at 25 bars/clubs', '🦉', 'nightlife', 2, 'nightlife_checkins', 25, '#C0C0C0'),

-- Total checkins
('regular_10', 'Regular', '10 total check-ins', '⭐', 'regular', 1, 'total_checkins', 10, '#CD7F32'),
('regular_50', 'Frequent Flyer', '50 total check-ins', '⭐', 'regular', 2, 'total_checkins', 50, '#C0C0C0'),
('regular_200', 'TableShare Legend', '200 total check-ins', '⭐', 'regular', 3, 'total_checkins', 200, '#FFD700')

ON CONFLICT (badge_code) DO NOTHING;

-- Function to calculate and update streaks
CREATE OR REPLACE FUNCTION update_checkin_streak(p_user_id UUID, p_checkin_date DATE)
RETURNS TABLE(
    current_streak INTEGER,
    longest_streak INTEGER,
    is_new_badge BOOLEAN,
    new_badge_code VARCHAR
) AS $$
DECLARE
    v_last_checkin DATE;
    v_current_streak INTEGER;
    v_longest_streak INTEGER;
    v_days_diff INTEGER;
    v_streak_record RECORD;
BEGIN
    -- Get existing streak data
    SELECT cs.current_streak, cs.longest_streak, cs.last_checkin_date
    INTO v_current_streak, v_longest_streak, v_last_checkin
    FROM checkin_streaks cs
    WHERE cs.user_id = p_user_id;
    
    -- If no record exists, create one
    IF v_last_checkin IS NULL THEN
        INSERT INTO checkin_streaks (user_id, current_streak, longest_streak, last_checkin_date, streak_start_date, total_checkins)
        VALUES (p_user_id, 1, 1, p_checkin_date, p_checkin_date, 1)
        RETURNING current_streak, longest_streak INTO v_current_streak, v_longest_streak;
    ELSE
        -- Calculate days difference
        v_days_diff := p_checkin_date - v_last_checkin;
        
        IF v_days_diff = 0 THEN
            -- Same day checkin, just increment total
            UPDATE checkin_streaks
            SET total_checkins = total_checkins + 1,
                updated_at = NOW()
            WHERE user_id = p_user_id;
        ELSIF v_days_diff = 1 THEN
            -- Consecutive day, increase streak
            v_current_streak := v_current_streak + 1;
            IF v_current_streak > v_longest_streak THEN
                v_longest_streak := v_current_streak;
            END IF;
            
            UPDATE checkin_streaks
            SET current_streak = v_current_streak,
                longest_streak = v_longest_streak,
                last_checkin_date = p_checkin_date,
                total_checkins = total_checkins + 1,
                updated_at = NOW()
            WHERE user_id = p_user_id;
            
            -- Log to history
            INSERT INTO streak_history (user_id, streak_date, streak_number)
            VALUES (p_user_id, p_checkin_date, v_current_streak)
            ON CONFLICT DO NOTHING;
        ELSE
            -- Streak broken
            INSERT INTO streak_history (user_id, streak_date, streak_number, streak_status, broken_reason)
            VALUES (p_user_id, p_checkin_date, 1, 'broken', 'Gap of ' || v_days_diff || ' days');
            
            -- Reset streak
            v_current_streak := 1;
            UPDATE checkin_streaks
            SET current_streak = 1,
                last_checkin_date = p_checkin_date,
                streak_start_date = p_checkin_date,
                total_checkins = total_checkins + 1,
                updated_at = NOW()
            WHERE user_id = p_user_id;
        END IF;
    END IF;
    
    -- Check for streak badges
    RETURN QUERY
    WITH new_badges AS (
        INSERT INTO user_badges (user_id, badge_id, progress_current, is_new)
        SELECT p_user_id, bd.badge_id, v_current_streak, true
        FROM badge_definitions bd
        WHERE bd.category = 'streak'
        AND bd.requirement_value <= v_current_streak
        AND NOT EXISTS (
            SELECT 1 FROM user_badges ub 
            WHERE ub.user_id = p_user_id 
            AND ub.badge_id = bd.badge_id
        )
        RETURNING bd.badge_code
    )
    SELECT v_current_streak, v_longest_streak, true, badge_code
    FROM new_badges
    
    UNION ALL
    
    SELECT v_current_streak, v_longest_streak, false, NULL::VARCHAR
    WHERE NOT EXISTS (SELECT 1 FROM new_badges);
END;
$$ LANGUAGE plpgsql;

-- Function to award badges based on different criteria
CREATE OR REPLACE FUNCTION check_and_award_badges(p_user_id UUID)
RETURNS TABLE(badge_code VARCHAR, badge_name VARCHAR) AS $$
BEGIN
    RETURN QUERY
    WITH user_stats AS (
        SELECT 
            COUNT(DISTINCT ci.restaurant_id) as unique_venues,
            COUNT(DISTINCT r.cuisine_type) as unique_cuisines,
            COUNT(DISTINCT CASE WHEN r.venue_type IN ('bar', 'nightclub') THEN ci.restaurant_id END) as nightlife_venues
        FROM check_ins ci
        JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
        WHERE ci.user_id = p_user_id
    ),
    match_stats AS (
        SELECT COUNT(*) as match_count
        FROM matches m
        WHERE (m.requester_id = p_user_id OR m.receiver_id = p_user_id)
        AND m.status = 'accepted'
    ),
    streak_stats AS (
        SELECT current_streak, total_checkins
        FROM checkin_streaks
        WHERE user_id = p_user_id
    ),
    new_badges AS (
        INSERT INTO user_badges (user_id, badge_id, progress_current, is_new)
        SELECT p_user_id, bd.badge_id, 
            CASE 
                WHEN bd.requirement_type = 'unique_venues' THEN us.unique_venues
                WHEN bd.requirement_type = 'cuisines' THEN us.unique_cuisines
                WHEN bd.requirement_type = 'matches' THEN ms.match_count
                WHEN bd.requirement_type = 'nightlife_checkins' THEN us.nightlife_venues
                WHEN bd.requirement_type = 'total_checkins' THEN COALESCE(ss.total_checkins, 0)
            END,
            true
        FROM badge_definitions bd
        CROSS JOIN user_stats us
        CROSS JOIN match_stats ms
        LEFT JOIN streak_stats ss ON true
        WHERE bd.category != 'streak' -- Streak badges handled separately
        AND (
            (bd.requirement_type = 'unique_venues' AND us.unique_venues >= bd.requirement_value)
            OR (bd.requirement_type = 'cuisines' AND us.unique_cuisines >= bd.requirement_value)
            OR (bd.requirement_type = 'matches' AND ms.match_count >= bd.requirement_value)
            OR (bd.requirement_type = 'nightlife_checkins' AND us.nightlife_venues >= bd.requirement_value)
            OR (bd.requirement_type = 'total_checkins' AND COALESCE(ss.total_checkins, 0) >= bd.requirement_value)
        )
        AND NOT EXISTS (
            SELECT 1 FROM user_badges ub 
            WHERE ub.user_id = p_user_id 
            AND ub.badge_id = bd.badge_id
        )
        RETURNING badge_id
    )
    SELECT bd.badge_code, bd.name
    FROM badge_definitions bd
    JOIN new_badges nb ON bd.badge_id = nb.badge_id;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE checkin_streaks IS 'Tracks user check-in streaks and statistics';
COMMENT ON TABLE badge_definitions IS 'Available badges that users can earn';
COMMENT ON TABLE user_badges IS 'Badges earned by users';
COMMENT ON TABLE streak_history IS 'Daily log of streak status for analytics';
