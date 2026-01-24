-- Add unique constraint to support UPSERT on user_badges
ALTER TABLE user_badges
ADD CONSTRAINT user_badges_user_id_badge_code_period_date_key 
UNIQUE (user_id, badge_code, period_date);
