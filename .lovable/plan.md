
## 구현 계획: Defect Dashboard를 T&C Dashboard와 동일한 구조/UX로 개편

Defect Management Dashboard의 내용, UI, 로직을 T&C Management Dashboard와 최대한 동일하게 적용하되, Defect 데이터 구조에 맞춰 아래 기준으로 변환하겠습니다.

## 확정 기준

사용자 답변 기준으로 Defect Dashboard의 T&C 대응 기준은 다음과 같이 적용합니다.

```text
T&C By System        → Defect By Sub Trade
T&C Pred stage       → Defect Planned Date
T&C T1 stage         → Defect Target Date
T&C T2 stage         → Defect Closed Date

Defect Actual        → actual_progress_pct = 100%
Defect Closure       → closed_date가 있는 항목
Data Date            → 최신 Defect import batch의 data_date
```

중요하게, Defect에서는 `Actual`과 `Closure`를 별개로 집계합니다.

```text
Actual  = 작업 종료, actual_progress_pct = 100%
Closure = Closed Date가 있는 항목
```

## 1. DB schema 보강: `actual_date` 추가

Defect Actual을 날짜별/누적 대시보드에서 정확히 집계하기 위해 `defect_items`에 신규 컬럼을 추가합니다.

```text
defect_items.actual_date date null
```

용도:

```text
- actual_progress_pct가 100%가 된 날짜
- Dashboard의 Actual 누적/일별 집계 기준 날짜
- Raw Data / Detail / Export에서도 표시 가능
```

기존 데이터 backfill 기준:

```text
actual_progress_pct >= 100 인 기존 항목:
actual_date = coalesce(
  actual_date,
  closed_date,
  updated_at::date
)
```

신규 import/update 기준:

```text
- Import 중 progress가 100%이고 actual_date가 비어 있으면 batch data_date를 actual_date로 저장
- 기존 progress가 100 미만/null → 신규 progress가 100 이상으로 변경되면 batch data_date를 actual_date로 저장
- progress가 100 미만으로 내려가면 actual_date는 null 처리
```

Manual Detail / Quick Update 기준:

```text
- progress가 100 이상으로 저장되고 actual_date가 비어 있으면 오늘 날짜로 저장
- progress가 100 미만으로 변경되면 actual_date를 null 처리
```

## 2. Defect 타입/필드 설정 업데이트

다음 파일/설정을 업데이트합니다.

```text
src/lib/defect-utils.ts
src/hooks/useDefectFieldConfig.ts
Defect field config seed/migration
```

추가 표시명:

```text
actual_date → Actual Date
```

Raw Data, Detail, Export에서 날짜 필드로 처리되도록 반영합니다.

```text
DATE_FILTER_FIELDS에 actual_date 추가
Export date field option에 Actual Date 추가
Defect detail form에 Actual Date 표시
```

## 3. Defect Dashboard 전용 utility 추가

T&C Dashboard의 `dashboard-utils.ts`와 동일한 구조를 Defect용으로 만듭니다.

예상 파일:

```text
src/lib/defect-dashboard-utils.ts
```

주요 타입:

```text
DefectForDashboard
DefectPlanActualMetrics
DefectPlanActualRow
DefectSCurvePoint
```

Stage mapping:

```text
planned  = Planned Date stage
target   = Target Date stage
closure  = Closed Date stage
```

집계 로직:

```text
Planned Date stage:
- Plan: planned_date 기준
- Actual: actual_date 기준
- Delay: planned_date <= Data Date 이고 actual_progress_pct < 100

Target Date stage:
- Plan: target_date 기준
- Actual: actual_date 기준
- Delay: target_date <= Data Date 이고 actual_progress_pct < 100

Closed Date stage:
- Plan: target_date 또는 planned_date 기준
- Actual: closed_date 기준
- Delay: target_date/planned_date <= Data Date 이고 closed_date 없음
```

이렇게 해서 `Actual`과 `Closure`를 분리합니다.

```text
Planned/Target stages의 Actual = progress 100% completion
Closed stage의 Actual = closed_date completion
```

## 4. Defect Dashboard UI를 T&C Dashboard와 동일하게 재구성

`src/pages/DefectDashboardPage.tsx`를 T&C Dashboard 구조로 개편합니다.

적용 UI:

```text
- Page title/header
- Team filter
- At-Risk threshold text
- Tier 1 KPI cards
- Stage cards
- Overdue / At-Risk alert banners
- Plan vs Actual - Summary tabs
- Plan vs Actual S-Curve chart
- Top 10 Overdue table
- Status Distribution pie chart
```

Defect용 label만 조정합니다.

```text
T&C Executive Dashboard → Defect Executive Dashboard
Total Subtests          → Total Defects
Done                    → Actual Complete
Remaining               → Remaining
Overdue Subtests        → Overdue Defects
Top 10 Overdue Subtests → Top 10 Overdue Defects
```

Stage labels:

```text
Planned
Target
Closure
```

## 5. Plan vs Actual Summary tabs 구성

T&C Dashboard의 tabs를 Defect 기준으로 동일하게 구성합니다.

```text
By Sub Trade
By Subcontractor
By Sub-Sub
By HDEC PIC
By Team
```

`By Sub Trade`가 T&C의 `By System` 역할을 합니다.

테이블 컬럼 구조는 T&C와 동일하게 유지합니다.

```text
Group
Stage
Total / Done / Remain
To Data Date (Cumulative): Plan / Actual / Δ
Data Date: Plan / Actual / Δ / Delay
Today: Plan / Actual / Δ / Delay
Progress
```

단, Defect 의미는 다음과 같이 적용합니다.

```text
Done:
- Planned/Target stage: actual_progress_pct = 100 and actual_date counted
- Closure stage: closed_date counted

Progress:
- Planned/Target stage: actual_date 기준 완료율
- Closure stage: closed_date 기준 완료율
```

## 6. S-Curve Chart를 T&C와 같은 형태로 적용

T&C의 composed chart 구조를 Defect Dashboard에도 적용합니다.

구성:

```text
- cumulative line: Planned Plan / Planned Actual
- cumulative line: Target Plan / Target Actual
- cumulative line: Closure Plan / Closure Actual
- stacked bar: daily/weekly met, shortfall, excess, future plan
- Daily / Weekly toggle
- date range picker
- Today reference line
```

Defect에 맞춰 chart legend는 다음처럼 표시합니다.

```text
Planned Plan (cum)
Planned Actual (cum)
Target Plan (cum)
Target Actual (cum)
Closure Plan (cum)
Closure Actual (cum)
```

## 7. Dashboard drill-down navigation

T&C Dashboard처럼 숫자/행 클릭 시 Raw Data로 이동하도록 구성합니다.

대상:

```text
/defects/raw-data
```

Query param mapping:

```text
team        → team
subTrade    → sub_trade
subcontractor → subcontractor_name
subsub      → subsub_name
hdecPic     → hdec_pic_name
dateStart/dateEnd/dateField
progress/status/closureStatus 관련 filter
```

필요 시 `DefectRawDataPage`에 다음 URL filter를 추가 보강합니다.

```text
actualDate / actual_date
actualComplete
closureComplete
overdue
atRisk
```

## 8. Top Overdue와 Status Distribution 조정

Top Overdue 기준:

```text
- Planned Date 또는 Target Date가 Data Date 이전/당일
- actual_progress_pct < 100
- delay days가 큰 순서
```

표시 컬럼:

```text
Sub Trade
Issue No
Level
Subcontractor
Days Late
```

행 클릭:

```text
/defects/{id}
```

Status Distribution:

```text
- Actual Progress distribution
  - 100%
  - 1~99%
  - 0% / blank

- Closure distribution
  - Closed Date exists
  - Not Closed
```

T&C의 T1/T2 pie block 위치와 UI를 유지하되, Defect 의미에 맞게 label을 변경합니다.

## 9. Excel export 적용

T&C Dashboard의 “Plan vs Actual - Summary” Excel export 기능을 Defect에도 적용합니다.

예상 신규/수정 파일:

```text
src/lib/defect-dashboard-excel-export.ts
```

Export title:

```text
SHAW Defect — Plan vs Actual (Sub Trade/Subcontractor/Sub-Sub/HDEC PIC/Team)
```

컬럼 구조는 T&C export와 동일하게 유지하되 Stage label은 Defect 기준으로 표시합니다.

```text
Planned
Target
Closure
```

## 10. Import / Detail / Quick Update의 `actual_date` 유지 로직

`actual_date`가 안정적으로 유지되도록 관련 update 로직도 함께 반영합니다.

수정 대상:

```text
src/pages/DefectImportPage.tsx
src/pages/DefectDetailPage.tsx
src/pages/DefectQuickUpdatePage.tsx
```

규칙:

```text
if actual_progress_pct >= 100:
  actual_date = existing actual_date || dataDate/importDate/today
else:
  actual_date = null
```

변경 이력/audit에도 필요하면 `actual_date` 변경을 기록합니다.

```text
defect_change_log
defect_schedule_change_audit 또는 별도 log 표시
```

단, 기존 schedule audit 구조가 planned/target/closed/progress 중심이므로, actual_date는 change_log에는 남기고 dashboard 집계용으로 우선 사용합니다.

## 11. 대량 데이터 로딩 개선

현재 Defect Dashboard는 `.limit(1000)`으로 제한되어 있습니다.

T&C Dashboard처럼 page range loading으로 변경합니다.

```text
range(0, 999)
range(1000, 1999)
...
```

이를 통해 1,000건 초과 defect item도 Dashboard에 모두 반영되도록 합니다.

## 12. 수정 대상 파일

예상 수정/추가 대상:

```text
supabase/migrations/[new]_add_defect_actual_date.sql

src/pages/DefectDashboardPage.tsx
src/lib/defect-dashboard-utils.ts
src/lib/defect-dashboard-excel-export.ts

src/lib/defect-utils.ts
src/hooks/useDefectFieldConfig.ts
src/pages/DefectRawDataPage.tsx
src/pages/DefectImportPage.tsx
src/pages/DefectDetailPage.tsx
src/pages/DefectQuickUpdatePage.tsx
src/pages/DefectExportPage.tsx
src/lib/defect-export-utils.ts
```

필요 시 기존 `DefectDailyCumulativeChart`는 Dashboard용으로 대체하거나, Progress page 전용으로 유지합니다.

## 13. 검증 항목

```text
1. /defects/dashboard가 T&C Dashboard와 동일한 레이아웃/카드/탭/차트 구조로 표시됨
2. Team filter가 full label 기준으로 표시됨
3. 최신 defect_upload_batches.data_date가 Data Date로 적용됨
4. By Sub Trade / Subcontractor / Sub-Sub / HDEC PIC / Team 탭이 동작함
5. Plan vs Actual table의 Planned/Target/Closure stage 집계가 표시됨
6. Actual은 actual_progress_pct = 100 기준으로 집계됨
7. Closure는 closed_date 기준으로 별도 집계됨
8. S-Curve가 daily/weekly toggle과 date range picker로 동작함
9. KPI/alert/table 숫자 클릭 시 /defects/raw-data로 drill-down됨
10. Top 10 Overdue Defects row 클릭 시 /defects/{id}로 이동함
11. Excel export가 Defect Dashboard 기준으로 생성됨
12. 1,000건 초과 defect item도 Dashboard에 모두 반영됨
13. Import 시 progress 100% 항목에 actual_date가 자동 저장됨
14. Detail/Quick Update에서 progress가 100%가 되면 actual_date가 저장되고, 100% 미만이면 null 처리됨
15. Raw Data/Detail/Export에서 Actual Date가 표시 및 필터링됨
16. 기존 T&C Dashboard에는 영향 없음
17. build가 성공함
```
