ALTER PUBLICATION supabase_realtime ADD TABLE public.warranty_comments;
ALTER TABLE public.warranty_comments REPLICA IDENTITY FULL;