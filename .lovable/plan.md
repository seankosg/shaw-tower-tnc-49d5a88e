# 비즈니스 룰 적용: 실제 날짜는 Data Date 이후일 수 없음

`actual_start_date`, `actual_completion_date`, `actual_closure_date`는 모두 Data Date 이하여야 합니다. 세 가지 영역에 검증을 적용합니다.

## 현재 위반 데이터
- Data Date: 2026-04-28
- `actual_start_date > DD`: 5건
- `actual_completion_date > DD`: 5건
- (모두 동일한 5건 — 같은 배치에서 4/29, 4/30 입력)

---

## 1. 엑셀 임포트: 위반 행 거부

**파일**: `src/contexts/DefectImportContext.tsx` (line 701 직후)

`issue_no` 누락 체크 직후에 새 검증 블록 추가:

```ts
// Business rule: actual dates cannot be after Data Date.
const futureActuals: string[] = [];
if (row.actual_start_date && row.actual_start_date > dataDate)
  futureActuals.push(`actual_start_date=${row.actual_start_date}`);
if (row.actual_completion_date && row.actual_completion_date > dataDate)
  futureActuals.push(`actual_completion_date=${row.actual_completion_date}`);
if (row.actual_closure_date && row.actual_closure_date > dataDate)
  futureActuals.push(`actual_closure_date=${row.actual_closure_date}`);
if (futureActuals.length > 0) {
  rejected++;
  pendingLogs.push({
    upload_id: uploadId,
    raw_row_no: row.rawRowNo,
    issue_no: row.issue_no,
    action_taken: 'rejected',
    reason_code: 'actual_date_after_data_date',
    reason_detail: `Actual date(s) cannot be later than Data Date (${dataDate}): ${futureActuals.join(', ')}.`,
  });
  await maybeFlush();
  continue;
}
```

기존 `rejected_rows` 카운터 및 row log 시스템에 자연스럽게 통합 → Import Logs 페이지에서 사유까지 확인 가능.

## 2. 기존 위반 데이터 클리어 (5건)

`actual_start_date`, `actual_completion_date`, `actual_closure_date` 중 Data Date보다 미래인 값을 `null`로 설정. 또한 `actual_progress_pct`가 100인데 `actual_completion_date`가 클리어된 경우 일관성을 위해 `actual_progress_pct`도 null로 (현재 5건은 progress_pct가 이미 null이라 영향 없음).

처리 방식: data 마이그레이션은 마이그레이션 도구가 아닌 insert/update 도구로 수행:
```sql
UPDATE defect_items
SET actual_start_date = CASE WHEN actual_start_date > '2026-04-28' THEN NULL ELSE actual_start_date END,
    actual_completion_date = CASE WHEN actual_completion_date > '2026-04-28' THEN NULL ELSE actual_completion_date END,
    actual_closure_date = CASE WHEN actual_closure_date > '2026-04-28' THEN NULL ELSE actual_closure_date END
WHERE is_active = true
  AND (actual_start_date > '2026-04-28' OR actual_completion_date > '2026-04-28' OR actual_closure_date > '2026-04-28');
```

(Data Date는 동적이지만 현재 시점의 위반만 1회 클리어합니다. 향후는 임포트/UI 검증으로 막힘.)

## 3. UI 입력 검증 (저장 차단)

대상 필드: `actual_start_date`, `actual_completion_date`, `actual_closure_date`.

영향받는 화면:
- **Defect Detail 페이지** (`src/pages/DefectDetailPage.tsx`) — 인라인 편집 시 저장 전 검증
- **Quick Update 페이지** (`src/pages/DefectQuickUpdatePage.tsx`) — 모바일 빠른 입력
- **Bulk Edit Bar** (`src/components/raw-data/BulkEditBar.tsx`) — Raw Data 일괄 편집

공통 검증 헬퍼를 신규 파일에 작성:

**파일 신규 생성**: `src/lib/defect-date-validation.ts`
```ts
export interface ActualDateValidationResult {
  ok: boolean;
  message?: string;
}

export function validateActualDateNotAfterDataDate(
  field: 'actual_start_date' | 'actual_completion_date' | 'actual_closure_date',
  value: string | null | undefined,
  dataDate: string,
): ActualDateValidationResult {
  if (!value) return { ok: true };
  if (value > dataDate) {
    return {
      ok: false,
      message: `${field.replace(/_/g, ' ')} (${value}) cannot be later than Data Date (${dataDate}).`,
    };
  }
  return { ok: true };
}
```

각 화면에서 저장 직전에 호출 → 위반 시 toast 에러 표시 + 저장 중단. Data Date는 `useLatestDataDate()` 훅에서 가져옴 (이미 사용 중).

## 영향 범위
- 임포트 행 거부 통계 증가 가능 — Import Summary 화면에 그대로 반영
- 기존 데이터 5건의 actual 날짜가 null로 변경되어 해당 항목들의 `completion_status` / `closure_status`가 재계산되어 Done → Planned/WIP로 변경될 수 있음
- 모든 입력 경로(임포트 + 3개 UI)에서 통일된 룰 적용
