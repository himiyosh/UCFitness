
-- 1. Create Groups Table
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  keyword TEXT NOT NULL UNIQUE,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL, 
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Group Members Table
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'MEMBER')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- 3. Migration: Port existing group_keyword data
DO $$
DECLARE
  r RECORD;
  kw TEXT;
  new_group_id UUID;
  member_role TEXT;
BEGIN
  -- Iterate all users who have group_keyword
  FOR r IN SELECT id, group_keyword FROM users WHERE group_keyword IS NOT NULL LOOP
    FOREACH kw IN ARRAY r.group_keyword LOOP
      -- Check if group exists
      SELECT id INTO new_group_id FROM groups WHERE keyword = kw;
      
      IF new_group_id IS NULL THEN
        -- Create new group (First user seen becomes OWNER)
        INSERT INTO groups (name, keyword, owner_id)
        VALUES (kw, kw, r.id) -- Use keyword as initial name
        RETURNING id INTO new_group_id;
        
        member_role := 'OWNER';
      ELSE
        member_role := 'MEMBER';
      END IF;

      -- Add membership (ignore if already added, shouldn't happen with clean migration)
      INSERT INTO group_members (group_id, user_id, role)
      VALUES (new_group_id, r.id, member_role)
      ON CONFLICT (group_id, user_id) DO NOTHING;
      
    END LOOP;
  END LOOP;
END $$;
