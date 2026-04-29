## 목표

DB의 라이브 운영 테이블에 잘못 저장된 **2001년 날짜를 2026년으로 일회 일괄 변경**합니다 (같은 월/일 유지, +25년).

## 영향 범위 (실측 결과)

방금 DB를 조회해 확인한 결과:

| 테이블 | 컬럼 | 영향 행 수 |
|---|---|---|
| `defect_items` | `planned_start_date` | **3** |
| `defect_items` | `planned_completion_date` | **3** |
| 그 외 모든 날짜 컬럼 (subtests T1/T2/Pred/R1/R2, defect actual_*, upload_batches.data_date 등) | — | 0 |

실제 변경되는 건 `defect_items`의 동일한 ~3개 행입니다. 나머지는 방어적으로 같은 마이그레이션에 포함하지만 0행에 영향.

## 마이그레이션 SQL (실행할 것)

```sql
BEGIN;

-- defect_items: 2001 → 2026 (+25 years, 월/일 유지)
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

-- subtests: 동일 처리 (현재 0건이지만 방어적으로 포함)
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

-- Upload data_date (현재 0건, 방어적)
UPDATE public.upload_batches
SET data_date = (data_date + INTERVAL '25 years')::date
WHERE EXTRACT(YEAR FROM data_date) = 2001;

UPDATE public.defect_upload_batches
SET data_date = (data_date + INTERVAL '25 years')::date
WHERE EXTRACT(YEAR FROM data_date) = 2001;

COMMIT;
```

## 처리 원칙

- **+25 years 방식**: 월/일은 그대로 유지하면서 연도만 2001 → 2026으로 이동 (예: `2001-04-29` → `2026-04-29`).
- **이력/감사/스냅샷 테이블은 손대지 않음**: `defect_change_log`, `subtest_change_log`, `defect_schedule_change_audit`, `schedule_change_audit`, `defect_daily_snapshots`, `database_snapshots`, `event_log` — 이전 잘못 입력된 시점의 사실 기록이라 보존.
- **트랜잭션**: 단일 BEGIN/COMMIT으로 원자적으로 적용.
- **`updated_at` 갱신**: 라이브 테이블의 `updated_at`도 같이 업데이트해 변경 추적 일관성 유지.
- **검증**: 적용 후 동일한 카운트 쿼리를 다시 돌려 모두 0인지 확인.

## 비고

- 단일 마이그레이션 파일로 1회만 실행 후 끝(재실행해도 무해 — 0건만 매칭).
- RLS는 마이그레이션(서비스 권한)에서는 우회되므로 권한 영향 없음.
