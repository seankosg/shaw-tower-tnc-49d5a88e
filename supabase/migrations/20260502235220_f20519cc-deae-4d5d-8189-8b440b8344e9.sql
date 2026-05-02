ALTER TABLE public.docs_drawings
  ADD COLUMN IF NOT EXISTS hdec_pic_name text,
  ADD COLUMN IF NOT EXISTS hdec_eng_name text;

UPDATE public.docs_drawings
SET hdec_pic_name = COALESCE(hdec_pic_name, 'ST Jeon'),
    hdec_eng_name = COALESCE(hdec_eng_name, 'ST Jeon');

INSERT INTO public.docs_field_config
  (field_name, display_name, source_origin, sort_order, is_enabled,
   visible_to_roles, editable_to_roles)
SELECT 'hdec_pic_name', 'HDEC PIC', 'system', 71, true,
       ARRAY['admin','superuser','senior_user','user']::app_role[],
       ARRAY['admin','superuser','senior_user','user']::app_role[]
WHERE NOT EXISTS (SELECT 1 FROM public.docs_field_config WHERE field_name = 'hdec_pic_name');

INSERT INTO public.docs_field_config
  (field_name, display_name, source_origin, sort_order, is_enabled,
   visible_to_roles, editable_to_roles)
SELECT 'hdec_eng_name', 'HDEC Eng', 'system', 72, true,
       ARRAY['admin','superuser','senior_user','user']::app_role[],
       ARRAY['admin','superuser','senior_user','user']::app_role[]
WHERE NOT EXISTS (SELECT 1 FROM public.docs_field_config WHERE field_name = 'hdec_eng_name');