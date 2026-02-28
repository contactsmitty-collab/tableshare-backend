-- Migration: Add Social Challenges System
-- Created: 2026-02-22

-- Challenge templates (reusable challenge definitions)
CREATE TABLE IF NOT EXISTS challenge_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Challenge details
    name VARCHAR(100) NOT NULL,
    description TEXT,
    challenge_type VARCHAR(50) NOT NULL, -- 'cuisine_explorer', 'venue_master', 'social_butterfly', 'nightlife_legend', 'weekend_warrior', 'newcomer_welcomer'
    
    -- Goal configuration
    goal_metric VARCHAR(50) NOT NULL, -- 'unique_cuisines', 'total_checkins', 'unique_venues', 'matches_made', 'groups_joined', 'streak_days'
    goal_value INTEGER NOT NULL DEFAULT 5,
    
    -- Timeframe
    duration_days INTEGER NOT NULL DEFAULT 7, -- How long the challenge runs
    
    -- Rewards
    points_reward INTEGER DEFAULT 100,
    badge_code VARCHAR(50), -- Badge awarded for completion (references badge_definitions)
    
    -- Whether this template can be used to create challenges
    is_active BOOLEAN DEFAULT true,
    
    -- Visual
    icon_url VARCHAR(500),
    cover_image_url VARCHAR(500),
    color_theme VARCHAR(50) DEFAULT '#FF6B6B',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Active challenges (instances of challenges currently running)
CREATE TABLE IF NOT EXISTS active_challenges (
    challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES challenge_templates(template_id) ON DELETE SET NULL,
    
    -- Challenge info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Timeframe
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Scope (who can participate)
    scope VARCHAR(50) DEFAULT 'global', -- 'global', 'city', 'venue_group', 'restaurant'
    scope_reference UUID, -- If city: city name stored as string or venue_group_id
    scope_city VARCHAR(100), -- For city-scoped challenges
    restaurant_id UUID REFERENCES restaurants(restaurant_id) ON DELETE CASCADE, -- If restaurant-specific
    
    -- Goal
    goal_metric VARCHAR(50) NOT NULL,
    goal_value INTEGER NOT NULL,
    
    -- Rewards
    points_reward INTEGER DEFAULT 100,
    badge_id UUID, -- References user_badges (awarded on completion)
    
    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'cancelled'
    
    -- Metadata
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL, -- Admin or restaurant owner
    featured BOOLEAN DEFAULT false, -- Show on home screen
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenge participants
CREATE TABLE IF NOT EXISTS challenge_participants (
    participant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES active_challenges(challenge_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Progress
    current_progress INTEGER DEFAULT 0,
    progress_percentage DECIMAL(5,2) DEFAULT 0.00,
    
    -- Status
    status VARCHAR(50) DEFAULT 'participating', -- 'participating', 'completed', 'withdrawn'
    
    -- Completion
    completed_at TIMESTAMP WITH TIME ZONE,
    rank_achieved INTEGER, -- Final rank when challenge ended
    
    -- Tracking
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (challenge_id, user_id)
);

-- Challenge progress history (for tracking progress over time)
CREATE TABLE IF NOT EXISTS challenge_progress_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant_id UUID NOT NULL REFERENCES challenge_participants(participant_id) ON DELETE CASCADE,
    
    progress_before INTEGER,
    progress_after INTEGER,
    progress_increment INTEGER,
    
    -- What triggered this progress
    action_type VARCHAR(50), -- 'checkin', 'match_accepted', 'group_joined', etc.
    action_reference UUID, -- ID of the triggering action
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User challenge stats (cumulative)
CREATE TABLE IF NOT EXISTS user_challenge_stats (
    stats_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Totals
    total_challenges_joined INTEGER DEFAULT 0,
    total_challenges_completed INTEGER DEFAULT 0,
    total_challenges_won INTEGER DEFAULT 0, -- Rank #1
    total_challenge_points_earned INTEGER DEFAULT 0,
    
    -- Streaks
    current_participation_streak INTEGER DEFAULT 0, -- Consecutive challenges joined
    longest_participation_streak INTEGER DEFAULT 0,
    
    -- Stats by type
    total_cuisine_challenges INTEGER DEFAULT 0,
    total_social_challenges INTEGER DEFAULT 0,
    total_venue_challenges INTEGER DEFAULT 0,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenge invitations (for friend challenges)
CREATE TABLE IF NOT EXISTS challenge_invitations (
    invitation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES active_challenges(challenge_id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
    message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE (challenge_id, invited_user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_active_challenges_status ON active_challenges(status);
CREATE INDEX IF NOT EXISTS idx_active_challenges_dates ON active_challenges(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_active_challenges_scope ON active_challenges(scope, scope_city);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge ON challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user ON challenge_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_status ON challenge_participants(status);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_participant ON challenge_progress_history(participant_id);
CREATE INDEX IF NOT EXISTS idx_challenge_invitations_user ON challenge_invitations(invited_user_id);

-- Views

-- Challenge leaderboard view
CREATE OR REPLACE VIEW challenge_leaderboard AS
SELECT 
    cp.challenge_id,
    cp.user_id,
    u.first_name,
    u.last_name,
    u.avatar_url,
    cp.current_progress,
    cp.progress_percentage,
    cp.status,
    cp.completed_at,
    cp.rank_achieved,
    ROW_NUMBER() OVER (
        PARTITION BY cp.challenge_id 
        ORDER BY cp.current_progress DESC, cp.completed_at ASC NULLS LAST
    ) as current_rank,
    ac.goal_value,
    ac.goal_metric,
    ac.name as challenge_name,
    ac.end_date
FROM challenge_participants cp
JOIN users u ON cp.user_id = u.user_id
JOIN active_challenges ac ON cp.challenge_id = ac.challenge_id
WHERE cp.status IN ('participating', 'completed');

-- Active challenges with participant count
CREATE OR REPLACE VIEW active_challenges_summary AS
SELECT 
    ac.*,
    COUNT(cp.participant_id) as participant_count,
    COUNT(CASE WHEN cp.status = 'completed' THEN 1 END) as completed_count,
    ct.icon_url as template_icon,
    ct.color_theme
FROM active_challenges ac
LEFT JOIN challenge_participants cp ON ac.challenge_id = cp.challenge_id
LEFT JOIN challenge_templates ct ON ac.template_id = ct.template_id
WHERE ac.status = 'active'
GROUP BY ac.challenge_id, ct.icon_url, ct.color_theme;

-- Function to join a challenge
CREATE OR REPLACE FUNCTION join_challenge(p_user_id UUID, p_challenge_id UUID)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    participant_id UUID
) AS $$
DECLARE
    v_challenge_status VARCHAR(50);
    v_end_date TIMESTAMP WITH TIME ZONE;
    v_existing_participant_id UUID;
    v_new_participant_id UUID;
BEGIN
    -- Check if challenge exists and is active
    SELECT status, end_date INTO v_challenge_status, v_end_date
    FROM active_challenges
    WHERE challenge_id = p_challenge_id;
    
    IF v_challenge_status IS NULL THEN
        RETURN QUERY SELECT false, 'Challenge not found'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    IF v_challenge_status != 'active' THEN
        RETURN QUERY SELECT false, 'Challenge is not active'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    IF v_end_date < NOW() THEN
        RETURN QUERY SELECT false, 'Challenge has ended'::TEXT, NULL::UUID;
        RETURN;
    END IF;
    
    -- Check if already participating
    SELECT participant_id INTO v_existing_participant_id
    FROM challenge_participants
    WHERE challenge_id = p_challenge_id AND user_id = p_user_id;
    
    IF v_existing_participant_id IS NOT NULL THEN
        RETURN QUERY SELECT false, 'Already participating in this challenge'::TEXT, v_existing_participant_id;
        RETURN;
    END IF;
    
    -- Join challenge
    INSERT INTO challenge_participants (challenge_id, user_id, status)
    VALUES (p_challenge_id, p_user_id, 'participating')
    RETURNING participant_id INTO v_new_participant_id;
    
    -- Update user stats
    INSERT INTO user_challenge_stats (user_id, total_challenges_joined)
    VALUES (p_user_id, 1)
    ON CONFLICT (user_id)
    DO UPDATE SET
        total_challenges_joined = user_challenge_stats.total_challenges_joined + 1,
        updated_at = NOW();
    
    RETURN QUERY SELECT true, 'Successfully joined challenge'::TEXT, v_new_participant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update challenge progress
CREATE OR REPLACE FUNCTION update_challenge_progress(
    p_user_id UUID,
    p_action_type VARCHAR(50),
    p_action_reference UUID DEFAULT NULL
)
RETURNS TABLE(
    challenges_updated INTEGER,
    completed_challenges TEXT[]
) AS $$
DECLARE
    v_challenges_updated INTEGER := 0;
    v_completed_challenges TEXT[] := ARRAY[]::TEXT[];
    v_participant RECORD;
    v_challenge RECORD;
    v_new_progress INTEGER;
    v_goal_value INTEGER;
BEGIN
    -- Find all active challenges this user is participating in
    FOR v_participant IN
        SELECT 
            cp.participant_id,
            cp.challenge_id,
            cp.current_progress,
            ac.goal_metric,
            ac.goal_value,
            ac.points_reward,
            ac.name as challenge_name,
            ac.badge_id
        FROM challenge_participants cp
        JOIN active_challenges ac ON cp.challenge_id = ac.challenge_id
        WHERE cp.user_id = p_user_id
        AND cp.status = 'participating'
        AND ac.status = 'active'
        AND ac.end_date >= NOW()
    LOOP
        v_new_progress := v_participant.current_progress;
        
        -- Calculate new progress based on goal metric and action type
        CASE v_participant.goal_metric
            WHEN 'unique_cuisines' THEN
                IF p_action_type = 'checkin' THEN
                    -- Count unique cuisines checked into during challenge period
                    SELECT COUNT(DISTINCT r.cuisine_type) INTO v_new_progress
                    FROM check_ins ci
                    JOIN restaurants r ON ci.restaurant_id = r.restaurant_id
                    WHERE ci.user_id = p_user_id
                    AND ci.check_in_time >= (SELECT start_date FROM active_challenges WHERE challenge_id = v_participant.challenge_id);
                END IF;
                
            WHEN 'total_checkins' THEN
                IF p_action_type = 'checkin' THEN
                    v_new_progress := v_participant.current_progress + 1;
                END IF;
                
            WHEN 'unique_venues' THEN
                IF p_action_type = 'checkin' THEN
                    -- Count unique venues checked into during challenge period
                    SELECT COUNT(DISTINCT restaurant_id) INTO v_new_progress
                    FROM check_ins
                    WHERE user_id = p_user_id
                    AND check_in_time >= (SELECT start_date FROM active_challenges WHERE challenge_id = v_participant.challenge_id);
                END IF;
                
            WHEN 'matches_made' THEN
                IF p_action_type = 'match_accepted' THEN
                    v_new_progress := v_participant.current_progress + 1;
                END IF;
                
            WHEN 'groups_joined' THEN
                IF p_action_type = 'group_joined' THEN
                    v_new_progress := v_participant.current_progress + 1;
                END IF;
                
            WHEN 'streak_days' THEN
                -- Get current streak from gamification system
                IF p_action_type = 'checkin' THEN
                    SELECT COALESCE(current_streak, 0) INTO v_new_progress
                    FROM checkin_streaks
                    WHERE user_id = p_user_id;
                    
                    IF v_new_progress IS NULL THEN
                        v_new_progress := 1;
                    END IF;
                END IF;
        END CASE;
        
        -- Only update if progress changed
        IF v_new_progress != v_participant.current_progress THEN
            -- Update participant progress
            UPDATE challenge_participants
            SET current_progress = v_new_progress,
                progress_percentage = LEAST(100.0, (v_new_progress::DECIMAL / v_participant.goal_value) * 100),
                last_updated_at = NOW()
            WHERE participant_id = v_participant.participant_id;
            
            -- Record progress history
            INSERT INTO challenge_progress_history (
                participant_id, progress_before, progress_after, 
                progress_increment, action_type, action_reference
            ) VALUES (
                v_participant.participant_id, v_participant.current_progress, 
                v_new_progress, v_new_progress - v_participant.current_progress,
                p_action_type, p_action_reference
            );
            
            v_challenges_updated := v_challenges_updated + 1;
            
            -- Check if challenge completed
            IF v_new_progress >= v_participant.goal_value THEN
                -- Mark as completed
                UPDATE challenge_participants
                SET status = 'completed', completed_at = NOW()
                WHERE participant_id = v_participant.participant_id;
                
                -- Award points
                INSERT INTO point_transactions (user_id, points, transaction_type, reference_id, description)
                VALUES (p_user_id, v_participant.points_reward, 'challenge_completed', v_participant.challenge_id, 
                        'Completed challenge: ' || v_participant.challenge_name);
                
                -- Update user stats
                UPDATE user_challenge_stats
                SET total_challenges_completed = total_challenges_completed + 1,
                    total_challenge_points_earned = total_challenge_points_earned + v_participant.points_reward,
                    updated_at = NOW()
                WHERE user_id = p_user_id;
                
                v_completed_challenges := array_append(v_completed_challenges, v_participant.challenge_name);
            END IF;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_challenges_updated, v_completed_challenges;
END;
$$ LANGUAGE plpgsql;

-- Seed challenge templates
INSERT INTO challenge_templates (name, description, challenge_type, goal_metric, goal_value, duration_days, points_reward, badge_code, color_theme)
VALUES 
    ('Cuisine Explorer', 'Try 5 different cuisines this week', 'cuisine_explorer', 'unique_cuisines', 5, 7, 100, 'cuisine_explorer_5', '#FF6B6B'),
    ('Venue Hopper', 'Check in at 10 different restaurants', 'venue_master', 'unique_venues', 10, 14, 150, 'venue_master_10', '#4ECDC4'),
    ('Social Butterfly', 'Make 3 new connections through matches', 'social_butterfly', 'matches_made', 3, 7, 75, 'social_butterfly_3', '#FFE66D'),
    ('Nightlife Legend', 'Check in at bars/nightclubs 5 times', 'nightlife_legend', 'total_checkins', 5, 7, 100, 'nightlife_5', '#95E1D3'),
    ('Weekend Warrior', 'Check in every day for 7 days straight', 'weekend_warrior', 'total_checkins', 7, 7, 200, 'weekend_warrior', '#F38181'),
    ('Local Guide', 'Join 5 different group dining experiences', 'newcomer_welcomer', 'groups_joined', 5, 14, 125, 'group_guide_5', '#AA96DA'),
    ('Streak Master', 'Maintain a 5-day check-in streak', 'streak_master', 'streak_days', 5, 7, 150, 'streak_5_days', '#FCBAD3')
ON CONFLICT DO NOTHING;

-- Create a sample active challenge
INSERT INTO active_challenges (
    template_id, name, description, start_date, end_date,
    scope, goal_metric, goal_value, points_reward, featured, status
)
SELECT 
    template_id,
    'Weekly ' || name,
    description || ' - This week''s featured challenge!',
    NOW(),
    NOW() + INTERVAL '7 days',
    'global',
    goal_metric,
    goal_value,
    points_reward,
    true,
    'active'
FROM challenge_templates
WHERE challenge_type = 'cuisine_explorer'
LIMIT 1;

-- Comments
COMMENT ON TABLE challenge_templates IS 'Reusable challenge definitions';
COMMENT ON TABLE active_challenges IS 'Currently running challenge instances';
COMMENT ON TABLE challenge_participants IS 'Users participating in challenges';
COMMENT ON TABLE challenge_progress_history IS 'Progress tracking history';
COMMENT ON TABLE user_challenge_stats IS 'Cumulative challenge statistics per user';
