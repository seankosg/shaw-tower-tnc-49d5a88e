
# 구현 계획: Raw Data 기반 공통 Stage Metrics 정합성 개선

## 목표

Dashboard, Schedule, Subtest List, Excel Export가 모두 동일한 Raw Data 필드를 기준으로 같은 숫자를 계산하도록 정리합니다.

```text
Raw Data Source of Truth:
- pred_status / pred_planned_date / pred_actual_date / predecessor_status_raw
- t1_status / t1_planned_date / t1_actual_date
- t2_status / t2_planned_date / t2_actual_date
```

Delay 값은 DB에 별도 저장하지 않고, 공통 계산 함수에서 동일하게 계산합니다.

```text
Delay 조건:
planned_date <= 기준일
AND stage is not Done
```

기준일은 화면별로 명확히 분리합니다.

```text
Data Date = 최신 completed import의 data_date
Today     = 실제 오늘 날짜
```

---

## 1. 공통 Stage Metrics 유틸 생성

새 파일을 추가합니다.

```text
src/lib/stage-metrics.ts
```

여기에 Pred / T1 / T2 공통 계산 로직을 모읍니다.

구현할 주요 함수:

```typescript
type StageKey = 'pred' | 't1' | 't2';

getStageStatus(row, stage)
getStagePlannedDate(row, stage)
getStageActualDate(row, stage)
isStageDone(row, stage)
isStagePlannedOn(row, stage, date)
isStageActualOn(row, stage, date)
isStagePlannedUpTo(row, stage, asOfDate)
isStageActualUpTo(row, stage, asOfDate)
isStageDelayedAsOf(row, stage, asOfDate)
getStageDelayDaysAsOf(row, stage, asOfDate)
getAnyStageDelayedAsOf(row, stages, asOfDate)
getMaxDelayDaysAsOf(row, stages, asOfDate)
```

Predecessor Done 판단도 여기로 통합합니다.

```text
Pred Done 판단:
1. pred_status === 'Done'이면 Done
2. pred_status가 null이고 predecessor_status_raw가 Done / Complete / 완료 계열이면 Done
3. 그 외에는 Not Done
```

T1/T2는 status 기준으로 판단합니다.

```text
T1 Done = t1_status === 'Done'
T2 Done = t2_status === 'Done'
```

---

## 2. Dashboard 집계 로직을 공통 함수로 변경

수정 대상:

```text
src/lib/dashboard-utils.ts
src/pages/DashboardPage.tsx
```

현재 Dashboard 내부에 흩어져 있는 아래 로직을 공통 함수로 교체합니다.

```text
- Overdue 판단
- At-Risk 판단
- Max delay days 판단
- Pred Done 판단
- Pred / T1 / T2 Plan <= Data Date
- Pred / T1 / T2 Actual <= Data Date
- Pred / T1 / T2 Delay as of Data Date
- Pred / T1 / T2 Delay as of Today
```

변경 후 Dashboard 기준은 그대로 유지합니다.

```text
Plan vs Actual Breakdown:
- To Data Date = planned_date <= Data Date / actual_date <= Data Date
- Data Date row = planned_date === Data Date / actual_date === Data Date
- Data Date Delay = planned_date <= Data Date AND not Done
- Today row = planned_date === Today / actual_date === Today
- Today Delay = planned_date <= Today AND not Done
```

단, 모든 판단은 `stage-metrics.ts`를 사용하게 합니다.

---

## 3. Schedule 집계 로직을 공통 함수로 변경

수정 대상:

```text
src/lib/schedule-utils.ts
src/pages/SchedulePage.tsx
src/components/schedule/ScheduleMatrix.tsx
```

현재 Schedule의 `isPredDone`, `getStageDates`, cumulative plan/actual 계산을 공통 함수 기반으로 변경합니다.

Schedule에는 As-of 기준 선택을 추가합니다.

```text
Cumulative 기준:
[Data Date] [Today]
```

기본값은 Today로 유지합니다.

```text
기본 Schedule:
As-of Today

Dashboard와 비교할 때:
As-of Data Date 선택 가능
```

Schedule Matrix의 좌측 header도 동적으로 바꿉니다.

```text
Today 선택 시:
Up to Today

Data Date 선택 시:
Up to Data Date
```

상단 설명도 명확히 표시합니다.

```text
Data Date: 21-Apr · Today: 22-Apr · Cumulative: Today
```

---

## 4. Schedule KPI와 Matrix 기준 통일

수정 대상:

```text
src/pages/SchedulePage.tsx
src/lib/schedule-utils.ts
```

현재 Schedule Matrix는 `stageFilter = all`일 때 Pred + T1 + T2를 포함하지만, 상단 KPI 일부는 T1/T2만 계산하고 있습니다.

이를 Matrix와 같은 기준으로 통일합니다.

```text
stageFilter = All:
- KPI = Pred + T1 + T2 기준

stageFilter = Pred:
- KPI = Pred 기준

stageFilter = T1:
- KPI = T1 기준

stageFilter = T2:
- KPI = T2 기준
```

다만 최종 완료율은 기존 의미가 중요하므로 별도 명칭으로 유지합니다.

```text
Overall Completion:
T2 Done / Total Subtests

Stage Progress:
현재 선택된 stageFilter 기준
```

---

## 5. Subtest List URL 필터 정합성 개선

수정 대상:

```text
src/pages/SubtestList.tsx
```

Dashboard / Schedule 클릭 시 Subtest List가 같은 row count를 보여야 하므로 URL 필터 판단도 공통 함수로 변경합니다.

대상 필터:

```text
status=overdue
status=at_risk

pred_delay_asof
t1_delay_asof
t2_delay_asof

date_from
date_to
date_field
stage
cell_status
```

변경 후 예시:

```text
Dashboard Pred Today Delay = 18
→ 클릭 URL: ?pred_delay_asof=2026-04-22
→ Subtest List count = 18
```

```text
Schedule Pred Plan on 2026-04-22 = N
→ 클릭 URL: ?date_from=2026-04-22&date_to=2026-04-22&date_field=planned&stage=pred
→ Subtest List count = N
```

Subtest List 상단 active filter label도 기준을 더 명확히 표시합니다.

```text
Pred Delay ≤ 22-Apr
T1 Delay ≤ 21-Apr
Planned 22-Apr
Actual 22-Apr
```

---

## 6. Stage Progress 표시 로직 통합

수정 대상:

```text
src/components/shared/StageProgress.tsx
```

현재 StageProgress 내부에도 Pred Done / Delay 판단이 별도로 있습니다.

이를 `stage-metrics.ts` 기반으로 변경합니다.

표시 기준:

```text
Done:
stage is Done

Delay:
planned_date < Today AND not Done

WIP:
status = WIP AND not Delay

Planned:
status = Planned AND not Delay

Empty:
status/date 없음
```

이렇게 하면 Subtest List의 progress pip와 Dashboard/Schedule의 delay 판단이 동일해집니다.

---

## 7. Import 로직 보강

수정 대상:

```text
src/contexts/ImportContext.tsx
```

기존 row 업데이트 시 status 자동 보완에 필요한 planned_date 조회가 일부 누락되어 있습니다.

현재 조회:

```text
t1_status
t1_actual_date
t2_status
t2_actual_date
pred_status
pred_actual_date
```

추가 조회:

```text
t1_planned_date
t2_planned_date
pred_planned_date
```

이렇게 하면 기존 row에 planned_date가 있는데 status가 비어 있는 경우에도 일관되게 Planned로 보완됩니다.

```text
planned_date exists
AND status is null
→ status = Planned
```

Done import 시 actual_date 자동 입력은 유지합니다.

```text
status = Done
AND actual_date is empty
→ actual_date = Data Date
```

---

## 8. Excel Export 정합성 반영

수정 대상:

```text
src/lib/dashboard-excel-export.ts
src/lib/schedule-excel-export.ts
```

Dashboard Excel은 Dashboard 화면과 같은 공통 계산 결과를 그대로 export합니다.

```text
Dashboard Excel:
- To Data Date
- Data Date
- Today
- Data Date Delay
- Today Delay
```

Schedule Excel은 Schedule 화면의 As-of 선택을 반영합니다.

```text
Today 선택 시:
Up to Today

Data Date 선택 시:
Up to Data Date
```

Excel meta row에도 기준일을 표시합니다.

```text
Data Date: 2026-04-21 · Today: 2026-04-22 · Cumulative: Data Date
```

---

## 9. DB 변경 여부

이번 최종권장안에서는 DB schema 변경을 하지 않습니다.

```text
추가 컬럼 없음
마이그레이션 없음
```

이유:

```text
- Today 기준 delay는 매일 바뀌므로 DB 저장 시 stale data 위험이 있음
- 수동 수정 / Import / Mobile Update 등 모든 entry point에서 재계산해야 하는 부담이 큼
- planned/status/actual Raw Data만 source of truth로 유지하는 것이 가장 안전함
```

다만 Import 당시 snapshot이 필요해지는 경우에는 별도 2단계로 검토할 수 있습니다.

---

## 10. 검증 항목

구현 후 아래를 확인합니다.

```text
1. Dashboard
- Pred / T1 / T2 To Data Date 숫자 확인
- Pred / T1 / T2 Data Date Delay 숫자 확인
- Pred / T1 / T2 Today Delay 숫자 확인
- Top Overdue가 공통 로직 기준으로 계산되는지 확인

2. Dashboard 클릭
- Pred Data Date Delay 클릭 row count 일치
- T1 Data Date Delay 클릭 row count 일치
- T2 Data Date Delay 클릭 row count 일치
- Pred Today Delay 클릭 row count 일치
- T1 Today Delay 클릭 row count 일치
- T2 Today Delay 클릭 row count 일치

3. Schedule
- As-of Today 기본값 확인
- As-of Data Date 선택 시 Dashboard To Data Date와 비교 가능
- Matrix의 Up to Today / Up to Data Date label 확인
- stageFilter All / Pred / T1 / T2별 KPI와 Matrix 총계 일치

4. Subtest List
- Dashboard에서 넘어온 delay filter count 일치
- Schedule cell 클릭 filter count 일치
- Progress pip의 Delay/Done 표시가 Dashboard/Schedule 기준과 일치

5. Import
- 기존 row 업데이트 시 planned_date 기반 Planned 자동 보완 확인
- Done status import 시 actual_date = Data Date 자동 입력 확인
- Pred / T1 / T2 모두 동일하게 동작 확인

6. Excel Export
- Dashboard Excel 숫자 = Dashboard 화면 숫자
- Schedule Excel 숫자 = Schedule 화면 숫자
- Data Date / Today / As-of label 일치

7. Build
- TypeScript build 통과
```

