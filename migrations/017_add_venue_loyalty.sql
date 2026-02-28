-- Migration: Add Venue Loyalty Points Program
-- Created: 2026-02-22

-- Venue loyalty programs (restaurants define their own programs)
CREATE TABLE IF NOT EXISTS venue_loyalty_programs (
    program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    
    -- Program settings
    program_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    
    -- Points earning (e.g., 1 point per $1 spent, or per visit)
    points_per_visit INTEGER DEFAULT 10,
    points_per_dollar DECIMAL(4,2) DEFAULT 0, -- 0 = disabled
    
    -- Welcome bonus
    welcome_bonus_points INTEGER DEFAULT 50,
    
    -- Check-in bonus (extra points for checking in via app)
    checkin_bonus_points INTEGER DEFAULT 5,
    
    -- Tier thresholds
    tier_1_name VARCHAR(50) DEFAULT 'Bronze',
    tier_1_threshold INTEGER DEFAULT 0,
    tier_1_benefits TEXT[], -- ['Free appetizer on 5th visit', '10% off']
    
    tier_2_name VARCHAR(50) DEFAULT 'Silver',
    tier_2_threshold INTEGER DEFAULT 100,
    tier_2_benefits TEXT[], -- ['Priority seating', '15% off', 'Free dessert monthly']
    
    tier_3_name VARCHAR(50) DEFAULT 'Gold',
    tier_3_threshold INTEGER DEFAULT 300,
    tier_3_benefits TEXT[], -- ['VIP table requests', '20% off', 'Chef''s special access']
    
    tier_4_name VARCHAR(50) DEFAULT 'Platinum',
    tier_4_threshold INTEGER DEFAULT 500,
    tier_4_benefits TEXT[], -- ['Complimentary champagne', '25% off', 'Private event invites']
    
    -- Redemption options
    redemption_enabled BOOLEAN DEFAULT false,
    points_per_reward INTEGER DEFAULT 100, -- Points needed for a reward
    reward_description TEXT DEFAULT 'Free appetizer or dessert',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (restaurant_id)
);

-- User's loyalty status at each venue
CREATE TABLE IF NOT EXISTS user_venue_loyalty (
    loyalty_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    program_id UUID REFERENCES venue_loyalty_programs(program_id) ON DELETE SET NULL,
    
    -- Points and tier
    total_points_earned INTEGER DEFAULT 0,
    current_points_balance INTEGER DEFAULT 0, -- Redeemable points
    current_tier INTEGER DEFAULT 1, -- 1=Bronze, 2=Silver, 3=Gold, 4=Platinum
    
    -- Visit tracking
    total_visits INTEGER DEFAULT 0,
    first_visit_date DATE,
    last_visit_date DATE,
    
    -- Rewards tracking
    total_rewards_redeemed INTEGER DEFAULT 0,
    
    -- Tier achieved dates
    tier_1_achieved_at TIMESTAMP WITH TIME ZONE,
    tier_2_achieved_at TIMESTAMP WITH TIME ZONE,
    tier_3_achieved_at TIMESTAMP WITH TIME ZONE,
    tier_4_achieved_at TIMESTAMP WITH TIME ZONE,
    
    -- Preferences
    auto_redeem BOOLEAN DEFAULT false, -- Auto-redeem when threshold reached
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE (user_id, restaurant_id)
);

-- Loyalty transactions (earn/redemption history)
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL, -- 'welcome_bonus', 'checkin', 'visit', 'spend', 'redemption', 'tier_bonus'
    points INTEGER NOT NULL, -- Positive for earn, negative for redeem
    
    -- Reference
    check_in_id UUID REFERENCES check_ins(check_in_id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES reservations(reservation_id) ON DELETE SET NULL,
    
    -- Context
    description TEXT,
    
    -- For redemptions
    reward_redeemed TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL -- Staff member if manual
);

-- Tier benefits available to redeem
CREATE TABLE IF NOT EXISTS available_tier_benefits (
    benefit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES venue_loyalty_programs(program_id) ON DELETE CASCADE,
    
    tier INTEGER NOT NULL, -- 1, 2, 3, or 4
    benefit_name VARCHAR(100) NOT NULL,
    benefit_description TEXT,
    
    -- Usage limits
    uses_per_month INTEGER, -- NULL = unlimited
    uses_per_visit INTEGER, -- NULL = unlimited
    
    -- Redemption
    requires_staff_approval BOOLEAN DEFAULT false,
    auto_apply BOOLEAN DEFAULT false, -- Auto-applies to bill
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User redeemed benefits
CREATE TABLE IF NOT EXISTS user_redeemed_benefits (
    redemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    benefit_id UUID NOT NULL REFERENCES available_tier_benefits(benefit_id) ON DELETE CASCADE,
    
    -- Redemption context
    check_in_id UUID REFERENCES check_ins(check_in_id) ON DELETE SET NULL,
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    
    -- Status
    status VARCHAR(50) DEFAULT 'available', -- 'available', 'used', 'expired'
    
    -- Timestamps
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE, -- Some benefits expire
    
    -- Usage
    staff_approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    notes TEXT
);

-- Special loyalty promotions/events
CREATE TABLE IF NOT EXISTS loyalty_promotions (
    promotion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    program_id UUID REFERENCES venue_loyalty_programs(program_id) ON DELETE CASCADE,
    
    -- Promotion details
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Bonus multipliers
    points_multiplier DECIMAL(3,2) DEFAULT 2.00, -- 2x points
    
    -- Validity
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Conditions
    days_of_week INTEGER[], -- [1,2,3,4,5] for Mon-Fri, NULL = all days
    minimum_party_size INTEGER,
    minimum_spend DECIMAL(10,2),
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_venue_loyalty_programs_restaurant ON venue_loyalty_programs(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_user_venue_loyalty_user ON user_venue_loyalty(user_id);
CREATE INDEX IF NOT EXISTS idx_user_venue_loyalty_restaurant ON user_venue_loyalty(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_user_venue_loyalty_tier ON user_venue_loyalty(current_tier);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_restaurant ON loyalty_transactions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type ON loyalty_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_redeemed_benefits_user ON user_redeemed_benefits(user_id);
CREATE INDEX IF NOT EXISTS idx_redeemed_benefits_status ON user_redeemed_benefits(status);

-- View for user loyalty summary
CREATE OR REPLACE VIEW user_venue_loyalty_summary AS
SELECT 
    uvl.*,
    r.name as restaurant_name,
    r.photo_url as restaurant_photo,
    r.address as restaurant_address,
    vlp.program_name,
    vlp.tier_1_name,
    vlp.tier_2_name,
    vlp.tier_3_name,
    vlp.tier_4_name,
    vlp.tier_1_threshold,
    vlp.tier_2_threshold,
    vlp.tier_3_threshold,
    vlp.tier_4_threshold,
    vlp.tier_1_benefits,
    vlp.tier_2_benefits,
    vlp.tier_3_benefits,
    vlp.tier_4_benefits,
    CASE 
        WHEN uvl.current_tier = 1 THEN vlp.tier_1_name
        WHEN uvl.current_tier = 2 THEN vlp.tier_2_name
        WHEN uvl.current_tier = 3 THEN vlp.tier_3_name
        WHEN uvl.current_tier = 4 THEN vlp.tier_4_name
    END as current_tier_name,
    CASE uvl.current_tier
        WHEN 1 THEN vlp.tier_2_threshold - uvl.total_points_earned
        WHEN 2 THEN vlp.tier_3_threshold - uvl.total_points_earned
        WHEN 3 THEN vlp.tier_4_threshold - uvl.total_points_earned
        ELSE 0
    END as points_to_next_tier,
    CASE uvl.current_tier
        WHEN 1 THEN vlp.tier_2_name
        WHEN 2 THEN vlp.tier_3_name
        WHEN 3 THEN vlp.tier_4_name
        ELSE NULL
    END as next_tier_name
FROM user_venue_loyalty uvl
JOIN restaurants r ON uvl.restaurant_id = r.restaurant_id
LEFT JOIN venue_loyalty_programs vlp ON uvl.program_id = vlp.program_id;

-- Function to award loyalty points
CREATE OR REPLACE FUNCTION award_loyalty_points(
    p_user_id UUID,
    p_restaurant_id UUID,
    p_transaction_type VARCHAR(50),
    p_points INTEGER,
    p_description TEXT DEFAULT NULL,
    p_check_in_id UUID DEFAULT NULL
)
RETURNS TABLE(
    new_total_points INTEGER,
    new_balance INTEGER,
    new_tier INTEGER,
    tier_upgraded BOOLEAN,
    points_earned INTEGER
) AS $$
DECLARE
    v_program_id UUID;
    v_current_tier INTEGER;
    v_total_points INTEGER;
    v_balance INTEGER;
    v_new_tier INTEGER;
    v_tier_thresholds INTEGER[];
    v_tier_upgraded BOOLEAN := false;
BEGIN
    -- Get program details
    SELECT program_id INTO v_program_id
    FROM venue_loyalty_programs
    WHERE restaurant_id = p_restaurant_id AND is_active = true;
    
    -- Get or create user loyalty record
    INSERT INTO user_venue_loyalty (
        user_id, restaurant_id, program_id,
        total_points_earned, current_points_balance, current_tier,
        total_visits, first_visit_date, last_visit_date,
        tier_1_achieved_at
    )
    VALUES (
        p_user_id, p_restaurant_id, v_program_id,
        p_points, p_points, 1,
        CASE WHEN p_transaction_type = 'checkin' THEN 1 ELSE 0 END,
        CURRENT_DATE, CURRENT_DATE,
        CASE WHEN p_points > 0 THEN NOW() ELSE NULL END
    )
    ON CONFLICT (user_id, restaurant_id)
    DO UPDATE SET
        total_points_earned = user_venue_loyalty.total_points_earned + p_points,
        current_points_balance = user_venue_loyalty.current_points_balance + p_points,
        total_visits = CASE 
            WHEN p_transaction_type = 'checkin' 
            THEN user_venue_loyalty.total_visits + 1 
            ELSE user_venue_loyalty.total_visits 
        END,
        last_visit_date = CURRENT_DATE,
        updated_at = NOW()
    RETURNING current_tier, total_points_earned, current_points_balance
    INTO v_current_tier, v_total_points, v_balance;
    
    -- Check for tier upgrades if we have a program
    IF v_program_id IS NOT NULL THEN
        SELECT ARRAY[tier_2_threshold, tier_3_threshold, tier_4_threshold]
        INTO v_tier_thresholds
        FROM venue_loyalty_programs
        WHERE program_id = v_program_id;
        
        -- Determine new tier
        v_new_tier := 1;
        IF v_total_points >= v_tier_thresholds[3] THEN
            v_new_tier := 4;
        ELSIF v_total_points >= v_tier_thresholds[2] THEN
            v_new_tier := 3;
        ELSIF v_total_points >= v_tier_thresholds[1] THEN
            v_new_tier := 2;
        END IF;
        
        -- Update tier if upgraded
        IF v_new_tier > v_current_tier THEN
            v_tier_upgraded := true;
            
            UPDATE user_venue_loyalty
            SET current_tier = v_new_tier,
                tier_1_achieved_at = CASE WHEN v_new_tier >= 1 AND tier_1_achieved_at IS NULL THEN NOW() ELSE tier_1_achieved_at END,
                tier_2_achieved_at = CASE WHEN v_new_tier >= 2 AND tier_2_achieved_at IS NULL THEN NOW() ELSE tier_2_achieved_at END,
                tier_3_achieved_at = CASE WHEN v_new_tier >= 3 AND tier_3_achieved_at IS NULL THEN NOW() ELSE tier_3_achieved_at END,
                tier_4_achieved_at = CASE WHEN v_new_tier >= 4 AND tier_4_achieved_at IS NULL THEN NOW() ELSE tier_4_achieved_at END
            WHERE user_id = p_user_id AND restaurant_id = p_restaurant_id;
        END IF;
    END IF;
    
    -- Record transaction
    INSERT INTO loyalty_transactions (
        user_id, restaurant_id, transaction_type, points,
        description, check_in_id
    ) VALUES (
        p_user_id, p_restaurant_id, p_transaction_type, p_points,
        p_description, p_check_in_id
    );
    
    RETURN QUERY SELECT v_total_points, v_balance, 
           COALESCE(v_new_tier, v_current_tier), 
           v_tier_upgraded, 
           p_points;
END;
$$ LANGUAGE plpgsql;

-- Function to redeem points for reward
CREATE OR REPLACE FUNCTION redeem_loyalty_points(
    p_user_id UUID,
    p_restaurant_id UUID,
    p_points_to_redeem INTEGER,
    p_reward_description TEXT DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    new_balance INTEGER,
    message TEXT
) AS $$
DECLARE
    v_current_balance INTEGER;
    v_program_id UUID;
BEGIN
    -- Check program exists and redemption enabled
    SELECT program_id, redemption_enabled INTO v_program_id
    FROM venue_loyalty_programs
    WHERE restaurant_id = p_restaurant_id;
    
    IF v_program_id IS NULL THEN
        RETURN QUERY SELECT false, 0, 'No loyalty program at this restaurant'::TEXT;
        RETURN;
    END IF;
    
    IF NOT (SELECT redemption_enabled FROM venue_loyalty_programs WHERE program_id = v_program_id) THEN
        RETURN QUERY SELECT false, 0, 'Redemption not enabled for this program'::TEXT;
        RETURN;
    END IF;
    
    -- Get current balance
    SELECT current_points_balance INTO v_current_balance
    FROM user_venue_loyalty
    WHERE user_id = p_user_id AND restaurant_id = p_restaurant_id;
    
    IF v_current_balance IS NULL THEN
        v_current_balance := 0;
    END IF;
    
    -- Check if enough points
    IF v_current_balance < p_points_to_redeem THEN
        RETURN QUERY SELECT false, v_current_balance, 
            ('Not enough points. You have ' || v_current_balance || ' points.')::TEXT;
        RETURN;
    END IF;
    
    -- Deduct points
    UPDATE user_venue_loyalty
    SET current_points_balance = current_points_balance - p_points_to_redeem,
        total_rewards_redeemed = total_rewards_redeemed + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id AND restaurant_id = p_restaurant_id;
    
    -- Record redemption transaction
    INSERT INTO loyalty_transactions (
        user_id, restaurant_id, transaction_type, points,
        description, reward_redeemed
    ) VALUES (
        p_user_id, p_restaurant_id, 'redemption', -p_points_to_redeem,
        'Redeemed ' || p_points_to_redeem || ' points',
        p_reward_description
    );
    
    RETURN QUERY SELECT true, v_current_balance - p_points_to_redeem, 
        ('Successfully redeemed ' || p_points_to_redeem || ' points')::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Seed sample loyalty programs for existing restaurants
INSERT INTO venue_loyalty_programs (
    restaurant_id, program_name, points_per_visit, welcome_bonus_points, checkin_bonus_points,
    tier_1_name, tier_1_threshold, tier_1_benefits,
    tier_2_name, tier_2_threshold, tier_2_benefits,
    tier_3_name, tier_3_threshold, tier_3_benefits,
    redemption_enabled, points_per_reward, reward_description
)
SELECT 
    r.restaurant_id,
    r.name || ' Rewards',
    10, -- points per visit
    50, -- welcome bonus
    5,  -- check-in bonus
    'Foodie', 0, ARRAY['Member pricing on select items'],
    'Regular', 100, ARRAY['Free appetizer on 5th visit', 'Priority seating'],
    'VIP', 250, ARRAY['20% off all visits', 'Complimentary dessert', 'Chef''s table access'],
    true, 100, 'Free appetizer or dessert of your choice'
FROM restaurants r
WHERE NOT EXISTS (
    SELECT 1 FROM venue_loyalty_programs vlp WHERE vlp.restaurant_id = r.restaurant_id
)
LIMIT 10;

-- Comments
COMMENT ON TABLE venue_loyalty_programs IS 'Loyalty program settings defined by each restaurant';
COMMENT ON TABLE user_venue_loyalty IS 'User loyalty status and points at each venue';
COMMENT ON TABLE loyalty_transactions IS 'History of points earned and redeemed';
COMMENT ON TABLE available_tier_benefits IS 'Benefits available at each tier for redemption';
COMMENT ON TABLE user_redeemed_benefits IS 'Benefits user has claimed';
COMMENT ON TABLE loyalty_promotions IS 'Special double/triple points events';
