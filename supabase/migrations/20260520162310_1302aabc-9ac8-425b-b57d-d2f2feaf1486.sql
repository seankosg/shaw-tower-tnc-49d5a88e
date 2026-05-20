INSERT INTO storage.buckets (id, name, public)
VALUES ('daily-notices', 'daily-notices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "daily_notices_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'daily-notices');

CREATE POLICY "daily_notices_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'daily-notices'
  AND (has_role(auth.uid(), 'superuser'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "daily_notices_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'daily-notices'
  AND (has_role(auth.uid(), 'superuser'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "daily_notices_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'daily-notices'
  AND (has_role(auth.uid(), 'superuser'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);