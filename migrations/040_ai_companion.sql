-- AI Companion: sessions, messages, preferences, nudges (040)
CREATE TABLE IF NOT EXISTS ai_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  session_type VARCHAR(30) NOT NULL CHECK (session_type IN ('copilot', 'solo_companion', 'shared_host')),
  match_id UUID REFERENCES matches(match_id) ON DELETE SET NULL,
  check_in_id UUID,
  restaurant_id UUID REFERENCES restaurants(restaurant_id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'ended', 'expired')),
  context_snapshot JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_id ON ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_active ON ai_sessions(user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ai_sessions_match_id ON ai_sessions(match_id);

CREATE TABLE IF NOT EXISTS ai_messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_sessions(session_id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  message_type VARCHAR(30) DEFAULT 'chat',
  metadata JSONB DEFAULT '{}',
  suggestion_used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id ON ai_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_created ON ai_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS ai_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  copilot_enabled BOOLEAN DEFAULT true,
  solo_companion_enabled BOOLEAN DEFAULT true,
  shared_host_enabled BOOLEAN DEFAULT false,
  ai_personality VARCHAR(30) DEFAULT 'friendly',
  topics_of_interest TEXT[] DEFAULT '{}',
  avoid_topics TEXT[] DEFAULT '{}',
  suggestion_frequency VARCHAR(20) DEFAULT 'moderate',
  avatar_enabled BOOLEAN DEFAULT false,
  selected_avatar_id VARCHAR(100),
  tts_enabled BOOLEAN DEFAULT true,
  tts_voice_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_nudges (
  nudge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  nudge_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  delivered BOOLEAN DEFAULT false,
  delivered_at TIMESTAMP WITH TIME ZONE,
  dismissed BOOLEAN DEFAULT false,
  acted_on BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_nudges_user_id ON ai_nudges(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_nudges_user_pending ON ai_nudges(user_id, delivered) WHERE delivered = false;
