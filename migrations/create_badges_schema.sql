-- Create Badges Table
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN ('DAILY', 'WEEKLY', 'MONTHLY')),
    type TEXT NOT NULL CHECK (type IN ('GROUP', 'GLOBAL')),
    rank INTEGER NOT NULL CHECK (rank IN (1, 2, 3)),
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create User Badges Table
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_code TEXT NOT NULL REFERENCES badges(code) ON DELETE CASCADE,
    awarded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    period_date DATE NOT NULL, -- The date/month the badge represents
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE, -- Optional, only for Group badges
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_awarded_at ON user_badges(awarded_at);

-- Seed Initial Badges
INSERT INTO badges (code, name, description, category, type, rank) VALUES
-- Global Daily
('GLOBAL_DAILY_1', 'Global Daily Gold', 'Ranked #1 in Global Daily Steps', 'DAILY', 'GLOBAL', 1),
('GLOBAL_DAILY_2', 'Global Daily Silver', 'Ranked #2 in Global Daily Steps', 'DAILY', 'GLOBAL', 2),
('GLOBAL_DAILY_3', 'Global Daily Bronze', 'Ranked #3 in Global Daily Steps', 'DAILY', 'GLOBAL', 3),

-- Global Weekly
('GLOBAL_WEEKLY_1', 'Global Weekly Gold', 'Ranked #1 in Global Weekly Steps', 'WEEKLY', 'GLOBAL', 1),
('GLOBAL_WEEKLY_2', 'Global Weekly Silver', 'Ranked #2 in Global Weekly Steps', 'WEEKLY', 'GLOBAL', 2),
('GLOBAL_WEEKLY_3', 'Global Weekly Bronze', 'Ranked #3 in Global Weekly Steps', 'WEEKLY', 'GLOBAL', 3),

-- Global Monthly
('GLOBAL_MONTHLY_1', 'Global Monthly Gold', 'Ranked #1 in Global Monthly Steps', 'MONTHLY', 'GLOBAL', 1),
('GLOBAL_MONTHLY_2', 'Global Monthly Silver', 'Ranked #2 in Global Monthly Steps', 'MONTHLY', 'GLOBAL', 2),
('GLOBAL_MONTHLY_3', 'Global Monthly Bronze', 'Ranked #3 in Global Monthly Steps', 'MONTHLY', 'GLOBAL', 3),

-- Group Daily
('GROUP_DAILY_1', 'Group Daily Gold', 'Ranked #1 in Group Daily Steps', 'DAILY', 'GROUP', 1),
('GROUP_DAILY_2', 'Group Daily Silver', 'Ranked #2 in Group Daily Steps', 'DAILY', 'GROUP', 2),
('GROUP_DAILY_3', 'Group Daily Bronze', 'Ranked #3 in Group Daily Steps', 'DAILY', 'GROUP', 3),

-- Group Weekly
('GROUP_WEEKLY_1', 'Group Weekly Gold', 'Ranked #1 in Group Weekly Steps', 'WEEKLY', 'GROUP', 1),
('GROUP_WEEKLY_2', 'Group Weekly Silver', 'Ranked #2 in Group Weekly Steps', 'WEEKLY', 'GROUP', 2),
('GROUP_WEEKLY_3', 'Group Weekly Bronze', 'Ranked #3 in Group Weekly Steps', 'WEEKLY', 'GROUP', 3),

-- Group Monthly
('GROUP_MONTHLY_1', 'Group Monthly Gold', 'Ranked #1 in Group Monthly Steps', 'MONTHLY', 'GROUP', 1),
('GROUP_MONTHLY_2', 'Group Monthly Silver', 'Ranked #2 in Group Monthly Steps', 'MONTHLY', 'GROUP', 2),
('GROUP_MONTHLY_3', 'Group Monthly Bronze', 'Ranked #3 in Group Monthly Steps', 'MONTHLY', 'GROUP', 3)

ON CONFLICT (code) DO NOTHING;
