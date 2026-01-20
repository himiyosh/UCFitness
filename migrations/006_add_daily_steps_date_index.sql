-- Add index on date column for daily_steps table to optimize range queries
-- Used extensively in leaderboard calculations (Global, Monthly, Weekly rankings)
CREATE INDEX IF NOT EXISTS idx_daily_steps_date ON public.daily_steps (date);
