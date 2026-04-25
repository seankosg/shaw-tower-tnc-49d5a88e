-- 1. Add hdec_eng_name column to defect_items
ALTER TABLE public.defect_items
  ADD COLUMN IF NOT EXISTS hdec_eng_name text;

-- 2. Create hdec_eng_master table
CREATE TABLE IF NOT EXISTS public.hdec_eng_master (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness on name
CREATE UNIQUE INDEX IF NOT EXISTS hdec_eng_master_name_lower_uniq
  ON public.hdec_eng_master ((lower(trim(name))));

-- 3. Enable RLS
ALTER TABLE public.hdec_eng_master ENABLE ROW LEVEL SECURITY;

-- 4. Policies (mirror hdec_pic_master)
DROP POLICY IF EXISTS "Anyone can read hdec eng master" ON public.hdec_eng_master;
CREATE POLICY "Anyone can read hdec eng master"
  ON public.hdec_eng_master
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can manage hdec eng master" ON public.hdec_eng_master;
CREATE POLICY "Admins can manage hdec eng master"
  ON public.hdec_eng_master
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_superuser(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can insert hdec engs" ON public.hdec_eng_master;
CREATE POLICY "Authenticated can insert hdec engs"
  ON public.hdec_eng_master
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_superuser(auth.uid()));

-- 5. Register field in defect_field_config (mirror hdec_pic_name configuration)
INSERT INTO public.defect_field_config (
  field_name,
  display_name,
  source_origin,
  is_required,
  is_enabled,
  sort_order,
  visible_to_roles,
  editable_to_roles,
  original_header
)
SELECT
  'hdec_eng_name',
  'HDEC Eng',
  'system',
  false,
  true,
  COALESCE((SELECT sort_order FROM public.defect_field_config WHERE field_name = 'hdec_pic_name'), 100) + 1,
  COALESCE((SELECT visible_to_roles FROM public.defect_field_config WHERE field_name = 'hdec_pic_name'), '{}'::app_role[]),
  COALESCE((SELECT editable_to_roles FROM public.defect_field_config WHERE field_name = 'hdec_pic_name'), '{}'::app_role[]),
  'HDEC Eng'
WHERE NOT EXISTS (
  SELECT 1 FROM public.defect_field_config WHERE field_name = 'hdec_eng_name'
);