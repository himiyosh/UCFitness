-- Resize group_keyword column to support multiple groups (array of text)
-- Run this in your Supabase SQL Editor

-- 1. Convert existing column to array type
-- This handles existing single values by converting them to a single-item array.
-- It also handles comma-separated strings if any exist manually, though unlikely.
ALTER TABLE users 
ALTER COLUMN group_keyword TYPE text[] 
USING string_to_array(replace(group_keyword, ' ', ''), ',');

-- 2. Set default value to empty array
ALTER TABLE users 
ALTER COLUMN group_keyword SET DEFAULT '{}';

-- 3. (Optional) Comment to document the column
COMMENT ON COLUMN users.group_keyword IS 'Array of group keywords the user belongs to';
