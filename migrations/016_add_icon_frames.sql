-- 新しいアイコンフレームを追加（既存5個に加えて10個追加 → 計15個）
-- 価格は10倍適用済み（015で既存も10倍済み）
-- preview_value はカラーマップのキーとして使用（実Tailwindクラス不要）

-- 既存フレームのランク制限を撤廃（価格がゲート）＆全て有効化
UPDATE shop_items SET rank_required = 'BEGINNER', is_active = true WHERE category = 'ICON_FRAME';

-- ※ 注意: 015 migration で既に全フレーム10倍済みなので、ここでは10倍後の価格で INSERT

-- ============ カジュアル帯（30,000〜80,000 UC） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('ICON_FRAME', 'frame_rose', 'Rose Frame', 'ローズフレーム', 'A soft pink glow', 'やさしいピンクの輝き', 30000, 'BEGINNER', 'ring-rose-400', true, 110),
('ICON_FRAME', 'frame_orange', 'Sunset Frame', 'サンセットフレーム', 'Warm orange radiance', '暖かいオレンジの光', 50000, 'BEGINNER', 'ring-orange-400', true, 111),
('ICON_FRAME', 'frame_teal', 'Teal Frame', 'ティールフレーム', 'Cool teal elegance', '落ち着いたティールの上品さ', 50000, 'BEGINNER', 'ring-teal-400', true, 112)
ON CONFLICT (item_code) DO NOTHING;

-- ============ ミドル帯（100,000〜300,000 UC） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('ICON_FRAME', 'frame_red', 'Crimson Frame', 'クリムゾンフレーム', 'Bold crimson energy', '大胆な深紅のエナジー', 100000, 'BEGINNER', 'ring-red-500', true, 120),
('ICON_FRAME', 'frame_indigo', 'Indigo Frame', 'インディゴフレーム', 'Deep indigo aura', '深いインディゴのオーラ', 150000, 'BEGINNER', 'ring-indigo-500', true, 121),
('ICON_FRAME', 'frame_emerald', 'Emerald Frame', 'エメラルドフレーム', 'Shining emerald brilliance', '煌めくエメラルドの輝き', 200000, 'BEGINNER', 'ring-emerald-500', true, 122),
('ICON_FRAME', 'frame_amber', 'Amber Frame', 'アンバーフレーム', 'Warm amber glow', '温もりのアンバーグロー', 300000, 'BEGINNER', 'ring-amber-500', true, 123)
ON CONFLICT (item_code) DO NOTHING;

-- ============ プレミアム帯（500,000〜2,000,000 UC） ============
INSERT INTO shop_items (category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order)
VALUES
('ICON_FRAME', 'frame_pink', 'Neon Pink Frame', 'ネオンピンクフレーム', 'Electric neon pink', 'エレクトリックなネオンピンク', 500000, 'BEGINNER', 'ring-pink-500', true, 130),
('ICON_FRAME', 'frame_sky', 'Sky Frame', 'スカイフレーム', 'Clear sky blue radiance', '澄み渡る空色の輝き', 800000, 'BEGINNER', 'ring-sky-400', true, 131),
('ICON_FRAME', 'frame_rainbow', 'Rainbow Frame', 'レインボーフレーム', 'All colors in one', '全ての色を纏う究極のフレーム', 2000000, 'BEGINNER', 'ring-rainbow', true, 140)
ON CONFLICT (item_code) DO NOTHING;
