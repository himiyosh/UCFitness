-- Update Global Badge Descriptions to reflect 10+ user requirement

-- Global Daily
UPDATE badges 
SET description = description || ' (Requires 10+ active users globally)' 
WHERE category = 'GLOBAL' AND type = 'DAILY' AND code LIKE 'GLOBAL_DAILY_%';

-- Global Weekly
UPDATE badges 
SET description = description || ' (Requires 10+ active users globally)' 
WHERE category = 'GLOBAL' AND type = 'WEEKLY' AND code LIKE 'GLOBAL_WEEKLY_%';

-- Global Monthly
UPDATE badges 
SET description = description || ' (Requires 10+ active users globally)' 
WHERE category = 'GLOBAL' AND type = 'MONTHLY' AND code LIKE 'GLOBAL_MONTHLY_%';
