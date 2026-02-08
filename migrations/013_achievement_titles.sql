-- 称号を購入型から達成型にリプレース
-- 既存の購入済み称号はそのまま残す（user_items FK による CASCADE 防止）
-- 新しい22個の達成型称号を追加

-- 既存の未購入TITLE items は is_active = false に（ショップ非表示）
UPDATE shop_items SET is_active = false WHERE category = 'TITLE';

-- ============ 歩数マイルストーン系（6個） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('TITLE', 'title_first_step', 'First Step', 'はじめの一歩', 'Reach 1,000 total steps', '累計1,000歩を達成', 1, 'BEGINNER', '🐣', false, 100),
('TITLE', 'title_stroll_master', 'Stroll Master', '散歩の達人', 'Reach 100,000 total steps', '累計100,000歩を達成', 1, 'BEGINNER', '🚶', false, 101),
('TITLE', 'title_marathon_runner', 'Marathon Runner', 'マラソンランナー', 'Reach 500,000 total steps', '累計500,000歩を達成', 1, 'BEGINNER', '🏃', false, 102),
('TITLE', 'title_globe_trotter', 'Globe Trotter', '地球一周チャレンジャー', 'Reach 1,000,000 total steps', '累計1,000,000歩を達成', 1, 'BEGINNER', '🌍', false, 103),
('TITLE', 'title_moon_walker', 'Moon Walker', '月面ウォーカー', 'Reach 5,000,000 total steps', '累計5,000,000歩を達成', 1, 'BEGINNER', '🚀', false, 104),
('TITLE', 'title_galaxy_voyager', 'Galaxy Voyager', '銀河の旅人', 'Reach 10,000,000 total steps', '累計10,000,000歩を達成', 1, 'BEGINNER', '☄️', false, 105)
ON CONFLICT (item_code) DO NOTHING;

-- ============ ストリーク系（4個） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('TITLE', 'title_beyond_three', 'Beyond Three Days', '三日坊主卒業', '7-day goal streak', '7日連続目標達成', 1, 'BEGINNER', '🔥', false, 200),
('TITLE', 'title_iron_will', 'Iron Will', '鉄の意志', '30-day goal streak', '30日連続目標達成', 1, 'BEGINNER', '💪', false, 201),
('TITLE', 'title_unbreakable', 'Unbreakable', '不屈の登山家', '100-day goal streak', '100日連続目標達成', 1, 'BEGINNER', '🏔️', false, 202),
('TITLE', 'title_legendary_streaker', 'Legendary Streaker', '伝説のストリーカー', '365-day goal streak', '365日連続目標達成', 1, 'BEGINNER', '👑', false, 203)
ON CONFLICT (item_code) DO NOTHING;

-- ============ ユニーク・おもしろ系（6個） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('TITLE', 'title_night_owl', 'Night Owl', '夜のフクロウ', 'Sync steps between midnight and 5 AM', '深夜0時〜5時にステップ同期', 1, 'BEGINNER', '🦉', false, 300),
('TITLE', 'title_early_bird', 'Early Bird', '早起きチャンピオン', 'Sync steps between 5-7 AM ten times', '朝5〜7時にステップ同期を10回', 1, 'BEGINNER', '🌅', false, 301),
('TITLE', 'title_bullseye', 'Bullseye', 'ぴったり賞', 'Hit your exact daily step goal', '1日の歩数がちょうど目標と一致', 1, 'BEGINNER', '🎯', false, 302),
('TITLE', 'title_uc_millionaire', 'UC Millionaire', 'UC長者', 'Reach 100,000 UC balance', 'UC残高100,000到達', 1, 'BEGINNER', '💰', false, 303),
('TITLE', 'title_shopaholic', 'Shopaholic', 'お買い物マスター', 'Purchase 5+ items from the shop', 'ショップで5個以上購入', 1, 'BEGINNER', '🛍️', false, 304),
('TITLE', 'title_just_in_time', 'Just In Time', 'ギリギリセーフ', 'Reach your goal after 23:00', '23:00以降に目標達成', 1, 'BEGINNER', '🫣', false, 305)
ON CONFLICT (item_code) DO NOTHING;

-- ============ ソーシャル・グループ系（3個） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('TITLE', 'title_top_of_world', 'Top of the World', '頂点の景色', 'Get 1st place in a group ranking', 'グループランキング1位を獲得', 1, 'BEGINNER', '🥇', false, 400),
('TITLE', 'title_team_player', 'Team Player', 'チームプレイヤー', 'Join 3 or more groups', '3つ以上のグループに参加', 1, 'BEGINNER', '🤝', false, 401),
('TITLE', 'title_founder', 'Founder', 'グループ創設者', 'Create a group', 'グループを作成', 1, 'BEGINNER', '📣', false, 402)
ON CONFLICT (item_code) DO NOTHING;

-- ============ ランキング系（3個） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('TITLE', 'title_weekly_ace', 'Weekly Ace', '週間エース', 'Finish in weekly top 3', '週間ランキングTOP3入り', 1, 'BEGINNER', '⭐', false, 500),
('TITLE', 'title_monthly_champion', 'Monthly Champion', '月間王者', 'Finish 1st in monthly ranking', '月間ランキング1位', 1, 'BEGINNER', '🏆', false, 501),
('TITLE', 'title_dark_horse', 'Dark Horse', 'ダークホース', 'Double your weekly steps from last week', '前週比200%以上の歩数増', 1, 'BEGINNER', '🐴', false, 502)
ON CONFLICT (item_code) DO NOTHING;
