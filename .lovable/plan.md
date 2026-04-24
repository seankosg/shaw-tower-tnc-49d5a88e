

## Defect Import 매핑 변경 + Status 자동 판정 (수정 v2)

기존 plan에 더해서 아래 사항을 반영합니다.

## 1. Excel 신규 컬럼 (총 9개)

```text
Planned Start Date
Planned Completion Date
Planned Closure Date
Actual Start Date
Actual Completion Date
Actual Closure Date
Planned Progress %
Completion Status
Closure Status
```

## 2. DB 스키마 변경

### 삭제
```text
defect_items: planned_date, target_date, closed_date, actual_date, closure_status (기존)
```

### 추가
```text
defect_items:
  planned_start_date         date
  planned_completion_date    date
  planned_closure_date       date
  actual_start_date          date
  actual_completion_date     date
  actual_closure_date        date
  planned_progress_pct       numeric
  completion_status          text   -- Planned | Delay | Done | WIP
  closure_status             text   -- Planned | Delay | Done | WIP

defect_daily_snapshots:
  - planned_date, closed_date 삭제
  + planned_completion_date, actual_completion_date
  + planned_closure_date, actual_closure_date
  + planned_progress_pct, actual_progress_pct
  + completion_status, closure_status

defect_schedule_change_audit:
  - planned_/target_/closed_ 컬럼 세트 삭제
  + planned_start / planned_completion / planned_closure
  + actual_start / actual_completion / actual_closure
    각각 _old_date, _new_date, _diff_days
  + planned_progress_old_pct / new_pct / diff_pct (기존 progress 컬럼 재활용)
  + completion_status_old / new
  + closure_status_old / new (기존 컬럼 의미 재정의)
```

기존 row 데이터 자동 매핑 없음. raw_payload는 보존.

## 3. Status 자동 판정 (`completion_status`, `closure_status`)

### Excel 값 우선순위

```text
1) Excel cell 값이 비어 있지 않고 4가지 enum (Planned/Delay/Done/WIP) 중 하나면 그대로 사용
2) Excel 값이 enum 외 값이면 reject log 기록 후 자동 계산값으로 대체
3) Excel 값이 비어 있으면:
   - planned_completion_date / planned_closure_date 둘 다 비어 있으면
     reason_code='missing_planned_dates'로 reject 로그 + status=null
   - 그 외에는 자동 계산
```

### Completion Status 자동 계산 (엄격 비교)

`asOf = batch.data_date ?? today`

```text
if actual_completion_date present
   OR (actual_progress_pct ≥ 100):
       'Done'
elif asOf < planned_start_date:
       'Planned'
elif (actual_progress_pct ?? 0) < (planned_progress_pct ?? 0):
       'Delay'
elif planned_completion_date < asOf AND no actual_completion_date:
       'Delay'
elif (actual_progress_pct ?? 0) > 0:
       'WIP'
else:
       'Planned'
```

### Closure Status 자동 계산 (Completion 연동)

```text
if actual_closure_date present:
       'Done'
elif planned_closure_date < asOf:
       'Delay'
elif completion_status == 'Done' AND no actual_closure_date:
       'WIP'   -- completion 끝났는데 closure 미완료
else:
       'Planned'
```

## 4. 재계산 시점

```text
A. Excel Import 직후
   - 해당 batch의 모든 row에 대해 위 규칙 재적용
   - status 변동 시 defect_change_log + defect_schedule_change_audit 기록

B. Detail 페이지에서 사용자가
   - planned_progress_pct / actual_progress_pct
   - planned_*_date / actual_*_date
   저장 시 → 그 row 한 건 재계산
   - 사용자가 status를 직접 override한 경우는 자동 계산 무시 (수동값 우선)
   - 단, override 여부를 구분하려면 별도 flag 필요. 본 plan에서는 단순화:
     "사용자가 status 필드를 직접 입력하면 그 값 그대로 저장"으로 처리.

C. Edge function (cron, daily)
   - supabase/functions/recompute-defect-status/index.ts 신규
   - pg_cron으로 매일 1회 실행 (KST 02:00)
   - asOf = today 기준으로 모든 active defect의 status 재계산
   - status가 바뀐 row만 update + change_log 기록
   - data date 기반 overdue 자동 반영
```

## 5. Import 단계 추가 reject 케이스

```text
reason_code='missing_planned_dates':
   Excel status 비어 있음 + planned_completion_date/closure_date 모두 없음
   → row는 생성되되 status=null, log에 기록

reason_code='invalid_status_value':
   Excel status가 4가지 enum이 아님
   → 자동 계산값으로 대체 + log
```

## 6. defect-parser.ts 매핑 (alias)

```text
'planned start date'      → planned_start_date
'planned completion date' → planned_completion_date
'planned closure date'    → planned_closure_date
'actual start date'       → actual_start_date
'actual completion date'  → actual_completion_date
'actual closure date'     → actual_closure_date
'planned progress %'      → planned_progress_pct
'planned progress'        → planned_progress_pct
'completion status'       → completion_status
'closure status'          → closure_status
```

기존 alias (`due date`, `target date`, `closed on`, `date closed`, `planned date`)는 모두 제거.

## 7. UI / Dashboard 영향

```text
DefectDetailPage:
  필드 그룹 표시
    Planned Start Date  | Actual Start Date
    Planned Completion  | Actual Completion
    Planned Closure     | Actual Closure
    Planned Progress %  | Actual Progress %
    Completion Status   | Closure Status

  Status는 select (Planned/Delay/Done/WIP) + "Auto recompute" 버튼

DefectQuickUpdatePage:
  actual_progress_pct, actual_completion_date, actual_closure_date,
  completion_status, closure_status, remarks 편집

DefectRawDataPage:
  컬럼/필터 정의 교체
  DATE_FILTER_FIELDS = [planned_start_date, planned_completion_date,
                       planned_closure_date, actual_start_date,
                       actual_completion_date, actual_closure_date]

DefectDashboardPage:
  3 stage = Start / Completion / Closure
  KPI: Done / WIP / Delay / Planned 4가지 색
  Plan vs Actual table = stage별 Planned/Actual 비교
  drill-down query key: stage=start|completion|closure

DefectProgressPage / DefectProgressMatrix:
  dateField 옵션: planned_completion_date | planned_closure_date

DefectExportPage / DefectDashboardExcelExport:
  컬럼 9개 신규 반영
```

## 8. 영향 받는 파일

```text
[migration]
supabase/migrations/<new>_defect_lifecycle_schema.sql

[edge function]
supabase/functions/recompute-defect-status/index.ts          (신규)
+ pg_cron 등록 SQL (insert 도구로 별도 실행)

[lib]
src/lib/defect-parser.ts
src/lib/defect-utils.ts                  (DefectItem, isClosed, isOverdue 재정의)
src/lib/defect-status.ts                 (신규: computeCompletionStatus / computeClosureStatus)
src/lib/defect-dashboard-utils.ts
src/lib/defect-progress-utils.ts
src/lib/defect-chart-utils.ts
src/lib/defect-export-utils.ts
src/lib/defect-dashboard-excel-export.ts

[pages / components]
src/pages/DefectImportPage.tsx
src/pages/DefectDetailPage.tsx
src/pages/DefectQuickUpdatePage.tsx
src/pages/DefectRawDataPage.tsx
src/pages/DefectDashboardPage.tsx
src/pages/DefectProgressPage.tsx
src/pages/DefectExportPage.tsx
src/components/defects/DefectProgressMatrix.tsx
src/components/defects/DefectDailyCumulativeChart.tsx
src/components/defects/DefectKpiCard.tsx
src/components/defects/DefectStatusBadge.tsx   (4 status 색상 매핑)
src/hooks/useDefectFieldConfig.ts

[seed]
defect_field_config row 교체 (insert 도구):
  - 기존 planned_date, target_date, closed_date, actual_date 행 삭제
  - 9개 신규 행 추가 (display_name, sort_order)

[test]
src/test/defect-status.test.ts (신규: 자동 계산 4 status 분기 검증)
src/test/defect-import-issue-assignment.test.ts (필요 시 보강)
```

## 9. 검증 항목

```text
1. Excel 9개 신규 헤더 import 시 정상 파싱 + DB 저장
2. Excel status enum 외 값 → invalid_status_value 로그 + 자동값
3. Excel status 비어 있고 planned 날짜 둘 다 없음 → missing_planned_dates 로그
4. Completion: actual=100 → Done
5. Completion: actual<planned → Delay
6. Completion: planned_completion_date < dataDate & not done → Delay
7. Completion: actual>0 & 진행 OK → WIP
8. Completion: dataDate < planned_start_date → Planned
9. Closure: actual_closure_date → Done
10. Closure: planned_closure_date < dataDate & no actual → Delay
11. Closure: completion=Done & no actual_closure → WIP
12. Closure: 그 외 → Planned
13. DetailPage 저장 시 해당 row recompute
14. 사용자가 status 직접 입력 시 그 값 보존
15. Cron edge function 실행 시 status 변동분만 update + log
16. Dashboard 3 stage / 4 status KPI 정상
17. RawData / Export / Progress 신규 필드 표시 정상
18. defect_schedule_change_audit row가 신규 필드 변경 시 정상 기록
19. build + tests pass
```

## 10. 데이터 마이그레이션

```text
- 기존 5개 컬럼 DROP
- 신규 9개 컬럼 ADD (모두 nullable)
- 기존 row의 기존 값은 자동 변환하지 않음
- 운영자가 새 Excel을 import하면 raw_payload + 신규 컬럼이 채워짐
```

