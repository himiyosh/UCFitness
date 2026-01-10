DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username') THEN 
        ALTER TABLE public.users ADD COLUMN username TEXT UNIQUE;
    END IF;
END $$;
