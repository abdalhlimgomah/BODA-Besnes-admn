-- Admin profiles table (linked to admin_users)
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  username text PRIMARY KEY REFERENCES public.admin_users(username) ON DELETE CASCADE,
  store_name text DEFAULT '',
  store_description text DEFAULT '',
  profile_image text DEFAULT '',
  email text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

-- Allow anon read for admin_profiles
DROP POLICY IF EXISTS "admin_profiles_anon_select" ON public.admin_profiles;
CREATE POLICY "admin_profiles_anon_select"
  ON public.admin_profiles FOR SELECT
  TO anon
  USING (true);

-- Allow anon upsert (INSERT or UPDATE) for admin_profiles
DROP POLICY IF EXISTS "admin_profiles_anon_upsert" ON public.admin_profiles;
CREATE POLICY "admin_profiles_anon_upsert"
  ON public.admin_profiles FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_profiles_anon_update" ON public.admin_profiles;
CREATE POLICY "admin_profiles_anon_update"
  ON public.admin_profiles FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Insert a default profile for existing admin if not exists
INSERT INTO public.admin_profiles (username, store_name, email)
SELECT username, username, username || '@buda.com'
FROM public.admin_users
ON CONFLICT (username) DO NOTHING;

-- Storage bucket for profile images
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "profile_images_public_upload" ON storage.objects;
CREATE POLICY "profile_images_public_upload"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'profile-images');

DROP POLICY IF EXISTS "profile_images_public_select" ON storage.objects;
CREATE POLICY "profile_images_public_select"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'profile-images');

DROP POLICY IF EXISTS "profile_images_public_delete" ON storage.objects;
CREATE POLICY "profile_images_public_delete"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'profile-images');
