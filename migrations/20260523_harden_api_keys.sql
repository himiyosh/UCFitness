CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS key_hash text,
  ADD COLUMN IF NOT EXISTS key_prefix text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

UPDATE public.api_keys
SET
  key_hash = encode(digest(key, 'sha256'), 'hex'),
  key_prefix = left(key, 8)
WHERE key_hash IS NULL
  AND key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_hash_idx
  ON public.api_keys (key_hash)
  WHERE key_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS api_keys_active_scope_idx
  ON public.api_keys (user_id, revoked_at, expires_at);
