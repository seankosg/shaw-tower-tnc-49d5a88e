

## Planned Progress % 자동 계산 plan (확정)

### 결정 사항 반영

```text
Q1. Data Date < Planned Start Date  → null (b: 아직 시작 전이므로 N/A)
Q2. Data Date > Planned Completion  → 100 (a)
Q3. Detail 단건 수정 Data Date 기준 → today() (a)
```

### 1. 계산 로직 (신규 `src/lib/defect-progress-calc.ts`)

```text
export function computePlannedProgressPct(
  plannedStart: string | null,
  plannedCompletion: string | null,
  dataDate: string,
): number | null

규칙 (위에서 아래 순서):
  1) plannedStart 또는 plannedCompletion null → null
  2) plannedCompletion < plannedStart → null (역전된 일정)
  3) dataDate < plannedStart → null   ← Q1=b
  4) duration_days = plannedCompletion - plannedStart
     duration=0 (start = completion):
       dataDate >= start → 100
       (dataDate < start 는 위에서 이미 null 처리됨)
  5) dataDate > plannedCompletion → 100 ← Q2=a
  6) 그 외 → round(lapsed/duration * 100, 1) (소수 1자리)

날짜 처리:
  - 'YYYY-MM-DD' 문자열을 UTC 자정으로 파싱
  - 일(day) 단위 정수 차이로 계산
```

### 2. Import 통합 (`src/pages/DefectImportPage.tsx`)

```text
- 매 row 처리 직전:
    const computedPlanned = computePlannedProgressPct(
      row.planned_start_date,
      row.planned_completion_date,
      dataDate,
    );
    row.planned_progress_pct = computedPlanned;  // Excel 값 무시·덮어쓰기

- statusInputs.planned_progress_pct 도 새 값 사용
- upsert payload, defect_daily_snapshots, audit 모두 새 값 사용
- 계산 불가 사유별 로그 (defect_upload_row_logs):
    a) plannedStart/Completion 누락
       → reason_code='planned_pct_not_computable'
          reason_detail='Missing planned_start_date or planned_completion_date'
    b) 역전된 일정 (completion < start)
       → reason_code='planned_pct_invalid_dates'
          reason_detail='Planned completion is earlier than planned start'
    c) Data Date < Planned Start (Q1=b로 null)
       → reason_code='planned_pct_not_started'
          reason_detail='Data date is before planned start date'
          (info 수준)
- 계산 결과가 기존 DB 값과 다르면 schedule_change_audit에
  planned_progress_old/new_pct 자동 기록 (기존 trackedFields 동작 유지)
```

### 3. 단건 수정 페이지 (`DefectDetailPage.tsx`, `DefectQuickUpdatePage.tsx`)

```text
- planned_start_date 또는 planned_completion_date 변경 시
  computePlannedProgressPct(start, completion, todayIso())
  결과를 form/payload에 자동 반영 (Q3=a: today 기준)
- planned_progress_pct 입력 필드는 read-only
  라벨 안내: "Auto-calculated from Planned Start/Completion and today()"
- 저장 시에도 서버로 보내는 payload는 자동 계산값 사용
```

### 4. 파서 (`src/lib/defect-parser.ts`)

```text
- planned_progress_pct 매핑은 그대로 유지 (Excel 호환을 위해 파싱은 함)
- Import 단계에서 무조건 덮어쓰므로 실질 영향 없음
```

### 5. 테스트 (신규 `src/test/defect-progress-calc.test.ts`)

```text
- null start → null
- null completion → null
- completion < start → null
- dataDate < start → null  (Q1=b)
- duration=0 & dataDate >= start → 100
- dataDate > completion → 100  (Q2=a)
- 정확한 중간값:
    start=2026-01-01, completion=2026-01-11, dataDate=2026-01-06 → 50.0
- 소수 1자리 반올림: lapsed=3, duration=7 → 42.9
- 윤년 케이스: 2024-02-28 ~ 2024-03-01 (윤일 포함)
```

### 6. 영향 받는 파일

```text
[신규]
src/lib/defect-progress-calc.ts
src/test/defect-progress-calc.test.ts

[수정]
src/pages/DefectImportPage.tsx       (계산 호출, 3종 로그)
src/pages/DefectDetailPage.tsx       (Planned 날짜 변경시 재계산, read-only)
src/pages/DefectQuickUpdatePage.tsx  (동일)
```

### 7. 검증 항목

```text
1. Excel에 'planned progress %' 컬럼 없어도 import 후 값이 채워짐
2. Excel에 값이 있어도 시스템 계산값으로 덮어써짐 (audit 기록)
3. start=2026-01-01, completion=2026-01-11, dataDate=2026-01-06 → 50.0
4. dataDate < start → null + 'planned_pct_not_started' info 로그
5. dataDate > completion → 100
6. start/completion 누락 → null + 'planned_pct_not_computable' 로그
7. completion < start → null + 'planned_pct_invalid_dates' 로그
8. Detail 페이지 Planned 날짜 수정 → planned_progress_pct 자동 갱신 (today 기준)
9. completion_status 자동 계산이 새 planned_pct 기준으로 동작
   (예: actual=30%, 계산된 planned=50% → 'Delay';
        planned=null → actual_pct만으로 판정)
10. defect_daily_snapshots의 planned_progress_pct 도 새 값으로 기록
11. build + vitest 통과
```

