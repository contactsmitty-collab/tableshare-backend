-- Table Alerts: "Notify me when someone wants to share a table at [restaurant] on [date]"
-- When two alerts overlap on restaurant + date, we can trigger match notification.
CREATE TABLE IF NOT EXISTS table_alerts (
  alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  time_preference VARCHAR(50) DEFAULT 'any', -- lunch, dinner, any
  status VARCHAR(50) DEFAULT 'watching', -- watching, matched, expired
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_table_alerts_user_id ON table_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_table_alerts_restaurant_id ON table_alerts(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_table_alerts_dates ON table_alerts(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_table_alerts_status ON table_alerts(status);
