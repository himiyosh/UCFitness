-- ストリークシールド用テーブル
CREATE TABLE IF NOT EXISTS user_streak_shields (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    remaining_uses INTEGER NOT NULL DEFAULT 0,
    last_used_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- shop_items の category CHECK 制約に CONSUMABLE を追加
ALTER TABLE shop_items DROP CONSTRAINT IF EXISTS shop_items_category_check;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_category_check
    CHECK (category IN ('ICON_FRAME', 'THEME_COLOR', 'TITLE', 'CONSUMABLE'));

-- shop_items にストリークシールドを追加
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES ('CONSUMABLE', 'streak_shield', 'Streak Shield', 'ストリークシールド', 'Protects your streak for 1 day if you miss your goal', '目標未達でもストリークを1日保護します', 5000, 'BEGINNER', '🛡️', true, 100)
ON CONFLICT DO NOTHING;
