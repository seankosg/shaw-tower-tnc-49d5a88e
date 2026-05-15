## 목표
OMM Raw Data에서 `sub2_actual_date`, `sub3_actual_date`, `final_actual_date`(즉, 2/3/Final차 Actual Submission Date)에 값이 채워지면, 같은 행의 대응되는 Expected Response Date(`sub2_response_planned_date`, `sub3_response_planned_date`, `final_response_planned_date`)가 자동으로 actual + 7일(달력일)로 채워지게 합니다. 직접 입력, Bulk Action, Excel Import, Detail Page edit 모든 경로에서 동일하게 동작해야 합니다.

## 적용 규칙
- **대상 차수**: Sub2, Sub3, Final (Sub1은 response_planned_date 컬럼이 없으므로 제외)
- **덮어쓰기 정책**: Expected Response Date가 비어 있을 때만 자동으로 채움. 이미 값이 있으면 그대로 둠 (사용자가 수동 조정한 값 보존).
- **계산식**: `expected = actual + INTERVAL '7 days'` (달력일, 주말/공휴일 무시)
- **Actual이 NULL로 지워지는 경우**: Expected는 그대로 유지(자동 삭제하지 않음).

## 구현 방식
모든 입력 경로(직접 입력 / Bulk / Import / Detail page)에서 일관되게 적용되도록 **DB 트리거**로 단일 처리합니다. 클라이언트 코드는 변경하지 않음.

### Migration: `docs_omm` BEFORE INSERT/UPDATE 트리거 추가

```text
trigger: docs_omm_auto_response_planned
  - sub2_actual_date IS NOT NULL AND sub2_response_planned_date IS NULL
      → sub2_response_planned_date := sub2_actual_date + 7
  - sub3_actual_date IS NOT NULL AND sub3_response_planned_date IS NULL
      → sub3_response_planned_date := sub3_actual_date + 7
  - final_actual_date IS NOT NULL AND final_response_planned_date IS NULL
      → final_response_planned_date := final_actual_date + 7
```

UPDATE 시에는 "actual이 새로 채워진 경우"(이전 NULL → 신규 값) 또는 "actual이 변경된 경우" 모두에서, Expected가 NULL일 때만 채움.

### 기존 데이터 보정 (one-time backfill)
이미 actual은 있는데 expected가 비어 있는 행에 대해서도 동일 규칙으로 한 번 UPDATE 실행:

```sql
UPDATE docs_omm
SET sub2_response_planned_date = sub2_actual_date + 7
WHERE sub2_actual_date IS NOT NULL AND sub2_response_planned_date IS NULL;
-- sub3, final 동일
```

## 영향 범위
- 변경 파일: 새 migration 1개 (`supabase/migrations/...`)
- 코드 변경: 없음
- UI 변경: 없음. 사용자는 actual을 입력/import하면 다음 reload 시 expected가 자동 채워진 상태로 표시됨
- Detail page에서 actual 저장 직후 expected 셀이 즉시 갱신되도록, 저장 후 reload 호출이 이미 존재하는지만 확인 (현재 `updateField` → `reload()` 패턴이라 자동 반영됨)

## 검증
- migration 적용 후 직접 입력으로 sub2_actual_date 입력 → expected가 +7일로 표시되는지 확인
- expected에 이미 값이 있을 때 actual을 변경해도 expected는 변하지 않는지 확인
- Import flow로 sub3_actual만 있는 행을 업로드 → expected가 자동 채워지는지 확인
