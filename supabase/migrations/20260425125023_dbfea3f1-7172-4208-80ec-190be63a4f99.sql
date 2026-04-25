ALTER TABLE public.subtests DISABLE TRIGGER validate_subtest_responsibility_update;
ALTER TABLE public.subtests DISABLE TRIGGER trg_event_log_subtests_upd;

UPDATE public.subtests
SET remarks = NULL
WHERE is_active = true
  AND remarks IS NOT NULL
  AND trim(remarks) <> '';

ALTER TABLE public.subtests ENABLE TRIGGER validate_subtest_responsibility_update;
ALTER TABLE public.subtests ENABLE TRIGGER trg_event_log_subtests_upd;