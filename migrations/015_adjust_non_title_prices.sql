-- ICON_FRAME と THEME_COLOR の価格を10倍に調整
-- 称号（TITLE）は対象外

UPDATE shop_items SET price = price * 10 WHERE category IN ('ICON_FRAME', 'THEME_COLOR');
