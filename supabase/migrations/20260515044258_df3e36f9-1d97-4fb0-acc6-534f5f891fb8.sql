-- 1. import_field_logs.kind 체크에 'punch' 추가
ALTER TABLE public.import_field_logs DROP CONSTRAINT IF EXISTS import_field_logs_kind_check;
ALTER TABLE public.import_field_logs ADD CONSTRAINT import_field_logs_kind_check
  CHECK (kind = ANY (ARRAY['tnc'::text, 'defect'::text, 'docs'::text, 'punch'::text]));

-- 2. punch_field_config 테이블 (defect_field_config 동일 스키마)
CREATE TABLE IF NOT EXISTS public.punch_field_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  original_header text,
  source_origin text NOT NULL DEFAULT 'system',
  visible_to_roles app_role[] DEFAULT '{}'::app_role[],
  editable_to_roles app_role[] DEFAULT '{}'::app_role[]
);

ALTER TABLE public.punch_field_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read punch field config"
  ON public.punch_field_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage punch field config"
  ON public.punch_field_config FOR ALL TO authenticated
  USING (is_admin_or_superuser(auth.uid()))
  WITH CHECK (is_admin_or_superuser(auth.uid()));

-- 3. punch_upload_batches.rollback_reason
ALTER TABLE public.punch_upload_batches
  ADD COLUMN IF NOT EXISTS rollback_reason text;
