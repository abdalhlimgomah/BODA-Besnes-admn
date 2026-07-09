-- Run this in Supabase SQL Editor
-- 1. Creates admin_users table
-- 2. Inserts default admin (change password after first login)

CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_select_self" ON public.admin_users;
CREATE POLICY "admin_users_select_self"
  ON public.admin_users
  FOR SELECT
  TO anon
  USING (true);

-- Insert default admin (username: admin, password: admin)
-- After login, go to SQL Editor and update with your own hash:
-- To generate a hash, open browser console and run:
--   await crypto.subtle.digest("SHA-256", new TextEncoder().encode("p|YOUR_PASSWORD|boda-admin"))
--     .then(h => Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,"0")).join(""))
INSERT INTO public.admin_users (username, password_hash)
VALUES ('admin', '2222')
ON CONFLICT (username) DO NOTHING;
