-- Delete users where name is NOT in the allowed list
DELETE FROM public.users 
WHERE name NOT IN ('サム・アルクマン', 'well hand');
