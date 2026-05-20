CREATE OR REPLACE FUNCTION public.punch_compute_derived()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  blockers text[] := '{}';
  v numeric;
  eval_date date;
  dur int;
  lapsed int;
BEGIN
  -- Pre-engineering blockers
  IF NEW.material_approval_status NOT IN ('approved','not_required') THEN
    blockers := array_append(blockers, 'Material Approval');
  END IF;
  IF NEW.material_procurement_status NOT IN ('secured','not_required') THEN
    blockers := array_append(blockers, 'Material Procurement');
  END IF;
  IF NEW.drawing_approval_status NOT IN ('approved','not_required') THEN
    blockers := array_append(blockers, 'Drawing Approval');
  END IF;
  IF NEW.mos_approval_status NOT IN ('approved','not_required') THEN
    blockers := array_append(blockers, 'MOS Approval');
  END IF;
  NEW.pre_engineering_blockers := blockers;
  NEW.pre_engineering_ready := array_length(blockers,1) IS NULL;

  -- Auto-compute Planned Progress % from planned dates and data_date
  eval_date := COALESCE(NEW.data_date, CURRENT_DATE);
  IF NEW.planned_start_date IS NULL OR NEW.planned_completion_date IS NULL
     OR NEW.planned_completion_date < NEW.planned_start_date
     OR eval_date < NEW.planned_start_date THEN
    NEW.planned_progress_pct := NULL;
  ELSIF NEW.planned_start_date = NEW.planned_completion_date
        OR eval_date >= NEW.planned_completion_date THEN
    NEW.planned_progress_pct := 100;
  ELSE
    dur := (NEW.planned_completion_date - NEW.planned_start_date);
    lapsed := (eval_date - NEW.planned_start_date);
    NEW.planned_progress_pct := round((lapsed::numeric / dur::numeric) * 100, 1);
  END IF;

  -- Variance & health
  IF NEW.actual_progress_pct IS NOT NULL AND NEW.planned_progress_pct IS NOT NULL THEN
    v := NEW.actual_progress_pct - NEW.planned_progress_pct;
    NEW.progress_variance_pct := v;
    IF v >= 5 THEN NEW.health_status := 'ahead';
    ELSIF v > -5 THEN NEW.health_status := 'on_track';
    ELSIF v > -15 THEN NEW.health_status := 'behind';
    ELSE NEW.health_status := 'critical';
    END IF;
  ELSE
    NEW.progress_variance_pct := NULL;
    NEW.health_status := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- Backfill existing rows so planned_progress_pct is populated via trigger
UPDATE public.punch_items SET row_version = row_version WHERE is_active = true;