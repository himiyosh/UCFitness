-- Seed Title Badges (Average Daily Steps)
INSERT INTO badges (code, name, description, category, type, rank, image_url) VALUES
('TITLE_AVGST_6K', 'Walker', 'Maintain an average of 6,000 steps/day.', 'TITLE', 'ACHIEVEMENT', 1, 'badge_walker.png'),
('TITLE_AVGST_8K', 'Hiker', 'Maintain an average of 8,000 steps/day.', 'TITLE', 'ACHIEVEMENT', 2, 'badge_hiker.png'),
('TITLE_AVGST_10K', 'Achiever', 'Maintain an average of 10,000 steps/day.', 'TITLE', 'ACHIEVEMENT', 3, 'badge_achiever.png'),
('TITLE_AVGST_15K', 'Athlete', 'Maintain an average of 15,000 steps/day.', 'TITLE', 'ACHIEVEMENT', 4, 'badge_athlete.png'),
('TITLE_AVGST_20K', 'Champion', 'Maintain an average of 20,000 steps/day.', 'TITLE', 'ACHIEVEMENT', 5, 'badge_champion.png')
ON CONFLICT (code) DO NOTHING;
