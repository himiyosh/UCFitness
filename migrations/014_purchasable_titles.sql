-- 購入型称号を追加（UCショップで購入可能）
-- 達成型称号（is_active=false, price=1）とは別に、is_active=true で実価格設定
-- ランク制限なし（価格自体がゲートの役割を果たすため全てBEGINNER）

-- 既に挿入済みの場合に備えて、全購入型称号のランクをBEGINNERに修正
UPDATE shop_items SET rank_required = 'BEGINNER' WHERE category = 'TITLE' AND is_active = true;

-- ============ Tier 1 — カジュアル系（50,000〜80,000 UC） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('TITLE', 'title_cat_person', 'Cat Person', '猫派です', 'Show your love for cats', '猫好きをアピール', 50000, 'BEGINNER', '🐱', true, 600),
('TITLE', 'title_dog_person', 'Dog Person', '犬派です', 'Show your love for dogs', '犬好きをアピール', 50000, 'BEGINNER', '🐶', true, 601),
('TITLE', 'title_walking_tomorrow', 'Walking Tomorrow', '歩くのは明日から', 'Procrastination is an art', '先延ばしも才能のうち', 60000, 'BEGINNER', '😴', true, 602),
('TITLE', 'title_ramen_lover', 'Ramen Lover', 'ラーメンは正義', 'Steps are just the warmup for ramen', '歩くのはラーメンのため', 60000, 'BEGINNER', '🍜', true, 603),
('TITLE', 'title_on_vacation', 'On Vacation', 'バカンス中', 'Out of office, out walking', '休暇モードで歩き中', 80000, 'BEGINNER', '🏖️', true, 604),
('TITLE', 'title_data_nerd', 'Data Nerd', 'データオタク', 'Numbers are beautiful', 'すべてはデータの中に', 80000, 'BEGINNER', '🤓', true, 605)
ON CONFLICT (item_code) DO NOTHING;

-- ============ Tier 2 — スタンダード系（100,000〜200,000 UC） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('TITLE', 'title_shadow_walker', 'Shadow Walker', '忍者ウォーカー', 'Walk without being seen', '影のように歩く者', 100000, 'BEGINNER', '🥷', true, 700),
('TITLE', 'title_grand_wizard', 'Grand Wizard', '大魔法使い', 'Channel arcane step energy', '歩数に魔法をかける', 100000, 'BEGINNER', '🧙', true, 701),
('TITLE', 'title_everyday_hero', 'Everyday Hero', '日常のヒーロー', 'No cape needed', 'マント不要のヒーロー', 150000, 'BEGINNER', '🦸', true, 702),
('TITLE', 'title_mysterious', 'Mysterious', 'ミステリアス', 'An enigma wrapped in steps', '謎に包まれた存在', 150000, 'BEGINNER', '🎭', true, 703),
('TITLE', 'title_moonlit_wanderer', 'Moonlit Wanderer', '月夜の放浪者', 'Walking under the moonlight', '月明かりの下を歩く者', 200000, 'BEGINNER', '🌙', true, 704)
ON CONFLICT (item_code) DO NOTHING;

-- ============ Tier 3 — プレミアム系（300,000〜500,000 UC） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('TITLE', 'title_diamond_walker', 'Diamond Walker', 'ダイヤモンドウォーカー', 'Steps that shine', '輝く一歩を踏み出す者', 300000, 'BEGINNER', '💎', true, 800),
('TITLE', 'title_the_king', 'The King', '歩数界の王', 'Long live the king', '歩数界に君臨する者', 400000, 'BEGINNER', '🦁', true, 801),
('TITLE', 'title_dragon_lord', 'Dragon Lord', '龍の支配者', 'Supreme ruler of the step realm', '全てを支配する龍', 500000, 'BEGINNER', '🐉', true, 802)
ON CONFLICT (item_code) DO NOTHING;
