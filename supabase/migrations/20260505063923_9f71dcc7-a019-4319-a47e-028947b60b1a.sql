DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='docs_field_config') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.docs_field_config';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='field_config') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.field_config';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='defect_field_config') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.defect_field_config';
  END IF;
END $$;

ALTER TABLE public.docs_field_config REPLICA IDENTITY FULL;
ALTER TABLE public.field_config REPLICA IDENTITY FULL;
ALTER TABLE public.defect_field_config REPLICA IDENTITY FULL;