-- Remove CHECK constraints to allow new categories/types/ranks
ALTER TABLE badges DROP CONSTRAINT IF EXISTS badges_category_check;
ALTER TABLE badges DROP CONSTRAINT IF EXISTS badges_type_check;
ALTER TABLE badges DROP CONSTRAINT IF EXISTS badges_rank_check;

-- We can re-add less restrictive checks or just leave them open. 
-- For safety, let's just leave them open or add expanded ones. 
-- Let's leave them open to allow flexibility.

-- Seed New Badges
INSERT INTO badges (code, name, description, category, type, rank) VALUES
-- Streak (Consistency)
('STREAK_3', '3 Day Streak', 'Reached daily goal for 3 consecutive days', 'STREAK', 'ACHIEVEMENT', 3), -- Bronze
('STREAK_7', 'Perfect Week', 'Reached daily goal for 7 consecutive days', 'STREAK', 'ACHIEVEMENT', 2), -- Silver
('STREAK_30', 'Monthly Master', 'Reached daily goal for 30 consecutive days', 'STREAK', 'ACHIEVEMENT', 1), -- Gold

-- Milestone (Total Steps)
('MILESTONE_100K', '100k Steps', 'Reached 100,000 total lifetime steps', 'MILESTONE', 'ACHIEVEMENT', 3), -- Bronze
('MILESTONE_500K', '500k Steps', 'Reached 500,000 total lifetime steps', 'MILESTONE', 'ACHIEVEMENT', 2), -- Silver
('MILESTONE_1M', 'Millionaire', 'Reached 1,000,000 total lifetime steps', 'MILESTONE', 'ACHIEVEMENT', 1), -- Gold

-- Lifestyle
('LIFESTYLE_WEEKEND', 'Weekend Warrior', 'High activity (>20k) on a weekend', 'LIFESTYLE', 'ACHIEVEMENT', 1) -- Gold

ON CONFLICT (code) DO NOTHING;
