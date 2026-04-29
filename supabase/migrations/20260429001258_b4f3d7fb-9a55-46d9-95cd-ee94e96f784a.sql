BEGIN;

-- Temporarily disable the responsibility-validation triggers so the
-- one-off date remap can run without an authenticated user context.
ALTER TABLE public.defect_items DISABLE TRIGGER USER;
ALTER TABLE public.subtests     DISABLE TRIGGER USER;

UPDATE public.defect_items
SET
  planned_start_date      = CASE WHEN EXTRACT(YEAR FROM planned_start_date)      = 2001 THEN (planned_start_date      + INTERVAL '25 years')::date ELSE planned_start_date      END,
  planned_completion_date = CASE WHEN EXTRACT(YEAR FROM planned_completion_date) = 2001 THEN (planned_completion_date + INTERVAL '25 years')::date ELSE planned_completion_date END,
  planned_closure_date    = CASE WHEN EXTRACT(YEAR FROM planned_closure_date)    = 2001 THEN (planned_closure_date    + INTERVAL '25 years')::date ELSE planned_closure_date    END,
  actual_start_date       = CASE WHEN EXTRACT(YEAR FROM actual_start_date)       = 2001 THEN (actual_start_date       + INTERVAL '25 years')::date ELSE actual_start_date       END,
  actual_completion_date  = CASE WHEN EXTRACT(YEAR FROM actual_completion_date)  = 2001 THEN (actual_completion_date  + INTERVAL '25 years')::date ELSE actual_completion_date  END,
  actual_closure_date     = CASE WHEN EXTRACT(YEAR FROM actual_closure_date)     = 2001 THEN (actual_closure_date     + INTERVAL '25 years')::date ELSE actual_closure_date     END,
  updated_at              = now()
WHERE EXTRACT(YEAR FROM planned_start_date)      = 2001
   OR EXTRACT(YEAR FROM planned_completion_date) = 2001
   OR EXTRACT(YEAR FROM planned_closure_date)    = 2001
   OR EXTRACT(YEAR FROM actual_start_date)       = 2001
   OR EXTRACT(YEAR FROM actual_completion_date)  = 2001
   OR EXTRACT(YEAR FROM actual_closure_date)     = 2001;

UPDATE public.subtests
SET
  pred_planned_date          = CASE WHEN EXTRACT(YEAR FROM pred_planned_date)          = 2001 THEN (pred_planned_date          + INTERVAL '25 years')::date ELSE pred_planned_date          END,
  pred_actual_date           = CASE WHEN EXTRACT(YEAR FROM pred_actual_date)           = 2001 THEN (pred_actual_date           + INTERVAL '25 years')::date ELSE pred_actual_date           END,
  t1_planned_date            = CASE WHEN EXTRACT(YEAR FROM t1_planned_date)            = 2001 THEN (t1_planned_date            + INTERVAL '25 years')::date ELSE t1_planned_date            END,
  t1_actual_date             = CASE WHEN EXTRACT(YEAR FROM t1_actual_date)             = 2001 THEN (t1_actual_date             + INTERVAL '25 years')::date ELSE t1_actual_date             END,
  t2_planned_date            = CASE WHEN EXTRACT(YEAR FROM t2_planned_date)            = 2001 THEN (t2_planned_date            + INTERVAL '25 years')::date ELSE t2_planned_date            END,
  t2_actual_date             = CASE WHEN EXTRACT(YEAR FROM t2_actual_date)             = 2001 THEN (t2_actual_date             + INTERVAL '25 years')::date ELSE t2_actual_date             END,
  r1_target_submission_date  = CASE WHEN EXTRACT(YEAR FROM r1_target_submission_date)  = 2001 THEN (r1_target_submission_date  + INTERVAL '25 years')::date ELSE r1_target_submission_date  END,
  r1_actual_submission_date  = CASE WHEN EXTRACT(YEAR FROM r1_actual_submission_date)  = 2001 THEN (r1_actual_submission_date  + INTERVAL '25 years')::date ELSE r1_actual_submission_date  END,
  r2_target_submission_date  = CASE WHEN EXTRACT(YEAR FROM r2_target_submission_date)  = 2001 THEN (r2_target_submission_date  + INTERVAL '25 years')::date ELSE r2_target_submission_date  END,
  r2_actual_submission_date  = CASE WHEN EXTRACT(YEAR FROM r2_actual_submission_date)  = 2001 THEN (r2_actual_submission_date  + INTERVAL '25 years')::date ELSE r2_actual_submission_date  END,
  r2_target_approval_date    = CASE WHEN EXTRACT(YEAR FROM r2_target_approval_date)    = 2001 THEN (r2_target_approval_date    + INTERVAL '25 years')::date ELSE r2_target_approval_date    END,
  r2_actual_approval_date    = CASE WHEN EXTRACT(YEAR FROM r2_actual_approval_date)    = 2001 THEN (r2_actual_approval_date    + INTERVAL '25 years')::date ELSE r2_actual_approval_date    END,
  updated_at                 = now()
WHERE EXTRACT(YEAR FROM pred_planned_date)         = 2001
   OR EXTRACT(YEAR FROM pred_actual_date)          = 2001
   OR EXTRACT(YEAR FROM t1_planned_date)           = 2001
   OR EXTRACT(YEAR FROM t1_actual_date)            = 2001
   OR EXTRACT(YEAR FROM t2_planned_date)           = 2001
   OR EXTRACT(YEAR FROM t2_actual_date)            = 2001
   OR EXTRACT(YEAR FROM r1_target_submission_date) = 2001
   OR EXTRACT(YEAR FROM r1_actual_submission_date) = 2001
   OR EXTRACT(YEAR FROM r2_target_submission_date) = 2001
   OR EXTRACT(YEAR FROM r2_actual_submission_date) = 2001
   OR EXTRACT(YEAR FROM r2_target_approval_date)   = 2001
   OR EXTRACT(YEAR FROM r2_actual_approval_date)   = 2001;

ALTER TABLE public.defect_items ENABLE TRIGGER USER;
ALTER TABLE public.subtests     ENABLE TRIGGER USER;

UPDATE public.upload_batches
SET data_date = (data_date + INTERVAL '25 years')::date
WHERE EXTRACT(YEAR FROM data_date) = 2001;

UPDATE public.defect_upload_batches
SET data_date = (data_date + INTERVAL '25 years')::date
WHERE EXTRACT(YEAR FROM data_date) = 2001;

COMMIT;