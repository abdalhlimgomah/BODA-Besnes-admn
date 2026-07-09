-- إنشاء bucket ai-details في Supabase Storage
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('ai-details', 'ai-details', true, false, 1048576, ARRAY['application/json'])
ON CONFLICT (id) DO NOTHING;

-- RLS للقراءة (للاي unauthenticated)
CREATE POLICY "ai_details_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'ai-details');

-- RLS للرفع (للـ anon)
CREATE POLICY "ai_details_insert_public" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'ai-details');

-- RLS للتعديل
CREATE POLICY "ai_details_update_public" ON storage.objects
  FOR UPDATE USING (bucket_id = 'ai-details');

-- RLS للحذف
CREATE POLICY "ai_details_delete_public" ON storage.objects
  FOR DELETE USING (bucket_id = 'ai-details');
