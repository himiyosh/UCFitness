
-- Insert 15 dummy users with high step counts to push the current user down

-- 1. Create Dummy Users
INSERT INTO users (id, email, name, image, username, group_keyword)
VALUES
    (uuid_generate_v4(), 'elite_walker_1@example.com', 'Elite Walker 1', NULL, 'elite_1', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_2@example.com', 'Elite Walker 2', NULL, 'elite_2', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_3@example.com', 'Elite Walker 3', NULL, 'elite_3', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_4@example.com', 'Elite Walker 4', NULL, 'elite_4', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_5@example.com', 'Elite Walker 5', NULL, 'elite_5', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_6@example.com', 'Elite Walker 6', NULL, 'elite_6', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_7@example.com', 'Elite Walker 7', NULL, 'elite_7', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_8@example.com', 'Elite Walker 8', NULL, 'elite_8', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_9@example.com', 'Elite Walker 9', NULL, 'elite_9', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_10@example.com', 'Elite Walker 10', NULL, 'elite_10', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_11@example.com', 'Elite Walker 11', NULL, 'elite_11', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_12@example.com', 'Elite Walker 12', NULL, 'elite_12', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_13@example.com', 'Elite Walker 13', NULL, 'elite_13', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_14@example.com', 'Elite Walker 14', NULL, 'elite_14', '{"UCF-TEST"}'),
    (uuid_generate_v4(), 'elite_walker_15@example.com', 'Elite Walker 15', NULL, 'elite_15', '{"UCF-TEST"}')
ON CONFLICT (email) DO NOTHING;

-- 2. Insert High Steps for Today (JST)
-- We'll assume the user has < 15,000 steps. We'll give these users 15k ~ 30k.

WITH jst_date AS (
  SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date AS today
)
INSERT INTO daily_steps (user_id, date, steps, created_at, updated_at)
SELECT 
    id, 
    (SELECT today FROM jst_date),
    -- Random steps between 15000 and 30000
    floor(random() * (30000 - 15000 + 1) + 15000)::int,
    now(),
    now()
FROM users 
WHERE username LIKE 'elite_%'
ON CONFLICT (user_id, date) 
DO UPDATE SET steps = EXCLUDED.steps;
