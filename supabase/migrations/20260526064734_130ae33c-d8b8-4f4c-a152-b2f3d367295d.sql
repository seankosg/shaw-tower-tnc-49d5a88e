
-- Backfill Subtask metadata fields from parent Summary where empty/null
UPDATE public.punch_items c SET category1 = p.category1
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.category1 IS NULL OR c.category1 = '') AND p.category1 IS NOT NULL AND p.category1 <> '';

UPDATE public.punch_items c SET category2 = p.category2
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.category2 IS NULL OR c.category2 = '') AND p.category2 IS NOT NULL AND p.category2 <> '';

UPDATE public.punch_items c SET category3 = p.category3
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.category3 IS NULL OR c.category3 = '') AND p.category3 IS NOT NULL AND p.category3 <> '';

UPDATE public.punch_items c SET critical_level = p.critical_level
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.critical_level IS NULL OR c.critical_level = '') AND p.critical_level IS NOT NULL AND p.critical_level <> '';

UPDATE public.punch_items c SET work_type = p.work_type
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.work_type IS NULL OR c.work_type = '') AND p.work_type IS NOT NULL AND p.work_type <> '';

UPDATE public.punch_items c SET main_trade = p.main_trade
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.main_trade IS NULL OR c.main_trade = '') AND p.main_trade IS NOT NULL AND p.main_trade <> '';

UPDATE public.punch_items c SET sub_trade = p.sub_trade
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.sub_trade IS NULL OR c.sub_trade = '') AND p.sub_trade IS NOT NULL AND p.sub_trade <> '';

UPDATE public.punch_items c SET location = p.location
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.location IS NULL OR c.location = '') AND p.location IS NOT NULL AND p.location <> '';

UPDATE public.punch_items c SET level = p.level
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.level IS NULL OR c.level = '') AND p.level IS NOT NULL AND p.level <> '';

UPDATE public.punch_items c SET team = p.team
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND c.team IS NULL AND p.team IS NOT NULL;

UPDATE public.punch_items c SET subcontractor_name = p.subcontractor_name
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.subcontractor_name IS NULL OR c.subcontractor_name = '') AND p.subcontractor_name IS NOT NULL AND p.subcontractor_name <> '';

UPDATE public.punch_items c SET subsub_name = p.subsub_name
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.subsub_name IS NULL OR c.subsub_name = '') AND p.subsub_name IS NOT NULL AND p.subsub_name <> '';

UPDATE public.punch_items c SET hdec_pic_name = p.hdec_pic_name
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.hdec_pic_name IS NULL OR c.hdec_pic_name = '') AND p.hdec_pic_name IS NOT NULL AND p.hdec_pic_name <> '';

UPDATE public.punch_items c SET hdec_eng_name = p.hdec_eng_name
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.hdec_eng_name IS NULL OR c.hdec_eng_name = '') AND p.hdec_eng_name IS NOT NULL AND p.hdec_eng_name <> '';

UPDATE public.punch_items c SET remarks = p.remarks
  FROM public.punch_items p WHERE c.parent_id = p.id AND p.is_summary
    AND (c.remarks IS NULL OR c.remarks = '') AND p.remarks IS NOT NULL AND p.remarks <> '';
