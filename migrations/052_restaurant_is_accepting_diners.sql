-- Accepting diners toggle: persisted to backend so app/portal can know if restaurant is "paused"
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_accepting_diners BOOLEAN DEFAULT true;

COMMENT ON COLUMN restaurants.is_accepting_diners IS 'Restaurant portal toggle: false = paused, not accepting TableShare diners';
