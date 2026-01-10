-- Insert Dummy Users
-- IDs are hardcoded to be easily identifiable and removable
INSERT INTO public.users (id, email, name, image, group_keyword, username) VALUES
('00000000-0000-0000-0000-000000000001', 'dummy1@example.com', 'Top Rank 1', 'https://api.dicebear.com/7.x/avataaars/svg?seed=1', '{"TestGroup"}', 'dummy_1'),
('00000000-0000-0000-0000-000000000002', 'dummy2@example.com', 'Top Rank 2', 'https://api.dicebear.com/7.x/avataaars/svg?seed=2', '{"TestGroup"}', 'dummy_2'),
('00000000-0000-0000-0000-000000000003', 'dummy3@example.com', 'Top Rank 3', 'https://api.dicebear.com/7.x/avataaars/svg?seed=3', '{"TestGroup"}', 'dummy_3'),
('00000000-0000-0000-0000-000000000004', 'dummy4@example.com', 'Mid Rank 4', 'https://api.dicebear.com/7.x/avataaars/svg?seed=4', '{"TestGroup"}', 'dummy_4'),
('00000000-0000-0000-0000-000000000005', 'dummy5@example.com', 'Mid Rank 5', 'https://api.dicebear.com/7.x/avataaars/svg?seed=5', '{"TestGroup"}', 'dummy_5'),
('00000000-0000-0000-0000-000000000006', 'dummy6@example.com', 'Mid Rank 6', 'https://api.dicebear.com/7.x/avataaars/svg?seed=6', '{"TestGroup"}', 'dummy_6'),
('00000000-0000-0000-0000-000000000007', 'dummy7@example.com', 'Low Rank 7', 'https://api.dicebear.com/7.x/avataaars/svg?seed=7', '{"TestGroup"}', 'dummy_7'),
('00000000-0000-0000-0000-000000000008', 'dummy8@example.com', 'Low Rank 8', 'https://api.dicebear.com/7.x/avataaars/svg?seed=8', '{"TestGroup"}', 'dummy_8'),
('00000000-0000-0000-0000-000000000009', 'dummy9@example.com', 'Low Rank 9', 'https://api.dicebear.com/7.x/avataaars/svg?seed=9', '{"TestGroup"}', 'dummy_9'),
('00000000-0000-0000-0000-000000000010', 'dummy10@example.com', 'Low Rank 10', 'https://api.dicebear.com/7.x/avataaars/svg?seed=10', '{"TestGroup"}', 'dummy_10')
ON CONFLICT (id) DO UPDATE SET 
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    image = EXCLUDED.image,
    group_keyword = EXCLUDED.group_keyword,
    username = EXCLUDED.username;

-- Insert Daily Steps for TODAY
-- Steps are distributed to create a clear ranking order
INSERT INTO public.daily_steps (user_id, date, steps) VALUES
('00000000-0000-0000-0000-000000000001', CURRENT_DATE, 30000),
('00000000-0000-0000-0000-000000000002', CURRENT_DATE, 28000),
('00000000-0000-0000-0000-000000000003', CURRENT_DATE, 25000),
('00000000-0000-0000-0000-000000000004', CURRENT_DATE, 20000),
('00000000-0000-0000-0000-000000000005', CURRENT_DATE, 18000),
('00000000-0000-0000-0000-000000000006', CURRENT_DATE, 15000),
('00000000-0000-0000-0000-000000000007', CURRENT_DATE, 10000),
('00000000-0000-0000-0000-000000000008', CURRENT_DATE, 8000),
('00000000-0000-0000-0000-000000000009', CURRENT_DATE, 5000),
('00000000-0000-0000-0000-000000000010', CURRENT_DATE, 3000)
ON CONFLICT (user_id, date) DO UPDATE SET steps = EXCLUDED.steps;
