# Aconex Status 기반 Completion/Closure 자동 매핑

## 목표
Excel import 시 Aconex `Status` 컬럼 값에 따라 `completion_status` / `closure_status` 를 자동으로 채운다.

| Aconex Status | 의미 | 자동 매핑 |
|---|---|---|
| `Open` | 진행 중 | 별도 처리 없음 (날짜·진행률 기반 자동 계산 유지) |
| `Work Done` | 완료됨 | **completion_status = Done** (그리고 `actual_completion_date`/`actual_progress_pct=100` 자동 보정) |
| `Closed` | 폐쇄됨 | **closure_status = Done** (기존 동작 유지) + 결과적으로 completion 도 Done |
| `In dispute` | 분쟁 중 | 별도 처리 없음 (`status` 원문만 보존) |

원본 Aconex `Status` 텍스트는 `defect_items.status` 컬럼에 그대로 보존된다.

## Excel 우선순위 (기존 정책 유지)
- Excel 에 `Completion Status` / `Closure Status` 또는 `Actual Completion Date` 가 명시되어 있으면 **Excel 값이 우선**.
- Aconex Status 자동 매핑은 Excel 명시값이 없을 때만 적용.
- 충돌이 발생하면 (예: Status=Closed 인데 Excel 이 actual_progress_pct=50) 기존 `closure_completion_conflict` 로그 메커니즘이 그대로 동작.

## 기술적 변경

### 1. `src/lib/defect-status.ts`
- 새 헬퍼 추가: `isStatusWorkDone(status)` — `"work done"` (대소문자/공백 무시) 매칭.
- `computeCompletionStatus()` 1번 규칙 확장:
  ```ts
  if (input.actual_completion_date 
      || actualPct >= 100 
      || isStatusWorkDone(input.status) 
      || isStatusClosed(input.status)) return 'Done';
  ```
  → `Closed` 도 자연스럽게 completion=Done 으로 승격 (현재는 closure 만 Done 처리).
- `reconcileClosureCompletion()` 의 자동 보정 로직 확장:
  - 기존: `closure=Done && completion!=Done` → `actual_completion_date`, `actual_progress_pct=100` 자동 채움.
  - 추가: `Status=Work Done && actual_completion_date 없음` → `actual_completion_date = data date`, `actual_progress_pct = 100` 채움 (Excel 명시값이 없을 때만, 기존 conflict 가드 동일 적용).

### 2. `src/contexts/DefectImportContext.tsx`
- 별도 변경 거의 없음. 이미 `statusInputs.status = row.status` 를 `reconcileClosureCompletion` 으로 전달 중.
- `excelExplicit` 충돌 가드는 그대로 사용 — Work Done 자동 보정도 동일 가드를 통과해야 적용됨.
- `pendingLogs` 에 정보성 로그 추가:
  - `reason_code: 'aconex_status_auto_mapped'`, detail 에 `"Status=Work Done → completion=Done auto-applied"` 또는 `"Status=Closed → closure=Done auto-applied"`.

### 3. 테스트 (`src/test/defect-status.test.ts` — 기존 파일 확장)
- Status=`Work Done` + 빈 actual_completion_date → completion=Done, patch 발생.
- Status=`Closed` + 빈 actual_completion_date → completion=Done, closure=Done, patch 발생.
- Status=`Open` → 기존 날짜·진행률 로직만 동작 (변경 없음).
- Status=`In dispute` → 기존 로직만 동작 (변경 없음).
- Status=`Work Done` + Excel 이 actual_progress_pct=50 명시 → conflict 플래그, patch 없음.

### 4. 영향 범위
- 신규 import 행: 즉시 적용.
- 기존 데이터: 자동 재계산은 기존 일일 cron(`recompute-defect-status`)이 처리. cron 도 동일 로직(`computeCompletion/Closure`)을 호출하지만 이 함수는 edge function 안에 인라인 복제되어 있음.
  - **포함 권장**: edge function `supabase/functions/recompute-defect-status/index.ts` 의 `computeCompletion` / `computeClosure` 에도 동일한 `Work Done` / `Closed` 분기 추가. 이렇게 해야 다음 cron 실행 시 기존 122건의 Work Done 행과 4건의 Closed 행이 일관되게 보정됨.

## 변경되지 않는 것
- DB 스키마 변경 없음.
- `defect_items.status` 컬럼은 Aconex 원문 그대로 저장.
- Excel 명시값 우선 정책 유지.
- StatusBadge UI 변경 없음 (별도 요청 시 추가 가능).

## 파일 목록
- `src/lib/defect-status.ts` (수정)
- `src/contexts/DefectImportContext.tsx` (로그 추가만)
- `supabase/functions/recompute-defect-status/index.ts` (동일 규칙 반영)
- `src/test/defect-status.test.ts` (테스트 추가)
