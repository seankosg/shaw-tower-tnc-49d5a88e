

## 재점검 결과

현재 구조는 큰 방향에서는 맞습니다.

```text
Dashboard Plan vs Actual
= Data Date까지 누계 / Data Date 당일 / Today 당일을 보여주는 Summary

Progress Gantt-lite
= 같은 Plan / Actual 개념을 날짜별 Day 또는 Week bucket으로 펼쳐 보여주는 상세 Timeline
```

다만 코드 기준으로 보면, 두 화면이 완전히 같은 로직을 공유하지는 않습니다.

## 현재 확인된 차이점

### 1. Plan / Actual 기본 날짜 판정은 대부분 일치합니다

두 화면 모두 아래 공통 stage helper를 사용하고 있습니다.

```text
planned date
actual date
stage done 여부
planned <= 기준일
actual <= 기준일
planned === 특정일
actual === 특정일
```

따라서 `Pred / T1 / T2`별 planned / actual 날짜를 읽는 기준은 대체로 동일합니다.

### 2. Dashboard Plan vs Actual 쪽 로직이 더 최신입니다

최근 수정된 Dashboard 로직은 아래 기준을 반영하고 있습니다.

```text
To Data Date Plan   = planned_date <= Data Date
To Data Date Actual = actual_date <= Data Date

Data Date Plan      = planned_date === Data Date
Data Date Actual    = actual_date === Data Date
Data Date Delay     = planned_date <= Data Date AND stage is not Done

Today Plan          = planned_date === Today
Today Actual        = actual_date === Today
Today Delay         = planned_date === Today AND stage is not Done
```

특히 중요하게 개선된 부분은 이것입니다.

```text
Today Delay는 누적 지연이 아니라, 오늘 계획 중 미완료 건만 계산
```

### 3. Progress 탭의 Gantt-lite는 날짜별 Plan / Actual 중심입니다

Progress 쪽은 현재 `aggregateSchedule`에서 날짜 bucket별로 다음을 계산합니다.

```text
bucket Plan   = planned_date가 해당 Day/Week에 속함
bucket Actual = actual_date가 해당 Day/Week에 속함
```

즉 Gantt-lite의 Timeline 셀은 Dashboard의 `Data Date Plan / Actual`, `Today Plan / Actual`을 날짜별로 펼친 형태에 가깝습니다.

### 4. Progress의 Delay 표현은 Dashboard와 혼동될 수 있습니다

Progress KPI에는 현재 다음 개념이 있습니다.

```text
Data Date Delay 또는 Today Delay
= planned_date <= asOfDate AND stage is not Done
```

즉 Progress의 `Today Delay`는 Dashboard의 `Today Delay`와 다릅니다.

```text
Dashboard Today Delay
= planned_date === today AND not Done

Progress Today Delay 현재 의미
= planned_date <= today AND not Done
```

이는 사용자가 보기에는 같은 이름인데 다른 값이 나올 수 있는 지점입니다.

따라서 Progress에서는 이 값을 `Today Delay`라고 부르기보다 다음처럼 명확히 구분하는 것이 안전합니다.

```text
Delay up to Today
또는
Cumulative Delay
```

또는 Dashboard 기준을 우선 적용한다면, Today mode의 Delay를 “오늘 계획 미완료” 기준으로 바꾸는 방향도 가능합니다.

## 적용 방향

요청하신 대로 **Dashboard의 Plan vs Actual 로직을 우선 기준**으로 삼고, Progress Gantt-lite가 그 로직을 날짜별로 세분화한 화면이 되도록 정리하겠습니다.

핵심 원칙은 아래와 같습니다.

```text
Dashboard = Summary
Progress  = 같은 로직의 Date Bucket 상세
```

## 구현 계획

### 1. Plan vs Actual 계산 기준을 공통화

현재 Dashboard와 Progress가 각각 비슷한 계산을 따로 하고 있으므로, 공통 계산 helper를 추가하거나 기존 helper를 확장하겠습니다.

공통 기준:

```text
stage = pred / t1 / t2

isPlanUpTo(stage, date)
isActualUpTo(stage, date)
isPlanOn(stage, date)
isActualOn(stage, date)
isDelayAsOf(stage, date)
isDelayOn(stage, date)
```

특히 아래 두 Delay를 명확히 분리합니다.

```text
누적 Delay:
planned_date <= 기준일 AND stage is not Done

당일 Delay:
planned_date === 기준일 AND stage is not Done
```

### 2. Dashboard Plan vs Actual 로직을 기준 로직으로 유지

`aggregatePlanActualByGroup`의 현재 개선 로직은 기준으로 유지합니다.

유지할 Dashboard 정의:

```text
To Data Date
- Plan: planned_date <= Data Date
- Actual: actual_date <= Data Date
- Δ: Actual - Plan

Data Date
- Plan: planned_date === Data Date
- Actual: actual_date === Data Date
- Δ: Actual - Plan
- Delay: planned_date <= Data Date AND not Done

Today
- Plan: planned_date === Today
- Actual: actual_date === Today
- Δ: Actual - Plan
- Delay: planned_date === Today AND not Done
```

### 3. Progress Gantt-lite의 날짜별 Plan / Actual을 Dashboard 기준에 맞춤

Progress Timeline의 각 bucket은 Dashboard의 “특정 날짜 Plan / Actual”을 펼친 값으로 정의합니다.

Day bucket:

```text
Plan   = planned_date === bucketDate
Actual = actual_date === bucketDate
```

Week bucket:

```text
Plan   = planned_date가 해당 week 범위 안에 있음
Actual = actual_date가 해당 week 범위 안에 있음
```

즉 Progress의 날짜별 셀은 아래 Dashboard 값과 직접 대응됩니다.

```text
Data Date column = Progress에서 Data Date 날짜 bucket
Today column     = Progress에서 Today 날짜 bucket
```

### 4. Progress의 누계 영역도 Dashboard의 To Data Date 기준과 맞춤

Progress 좌측 sticky 영역의 `Up to {asOfLabel}`은 누계 영역이므로 아래 기준을 유지하되, Dashboard와 동일한 helper를 사용하도록 바꾸겠습니다.

```text
Plan   = planned_date <= asOfDate
Actual = actual_date <= asOfDate
Diff   = Actual - Plan
```

`asOfMode = Data Date`일 때는 Dashboard의 `To Data Date`와 같은 의미가 됩니다.

### 5. Progress Delay 명칭과 계산을 명확히 정리

현재 Progress KPI의 `{asOfLabel} Delay`는 누적 Delay입니다.

혼동 방지를 위해 표시명을 다음처럼 바꾸는 것을 계획합니다.

```text
기존:
Today Delay
Data Date Delay

변경:
Delay up to Today
Delay up to Data Date
```

계산은 누적 Delay로 유지합니다.

```text
planned_date <= asOfDate AND stage is not Done
```

이렇게 하면 Dashboard의 `Today Delay`와 충돌하지 않습니다.

Dashboard의 `Today Delay`는 계속 아래 기준입니다.

```text
planned_date === today AND stage is not Done
```

### 6. Progress에서 Today bucket은 “오늘 당일 현황”으로 유지

Progress Timeline의 Today column은 Dashboard Today 영역과 같은 의미를 갖도록 확인합니다.

```text
Today bucket Plan   = planned_date === today
Today bucket Actual = actual_date === today
```

추가로 셀의 shortfall 표시가 있다면 이는 다음 의미로 유지합니다.

```text
Short = 해당 날짜 Plan - 해당 날짜 Actual
```

이는 Delay와는 다른 개념이므로, UI tooltip 또는 label에서 혼동되지 않게 정리하겠습니다.

### 7. Total / Done / Remain 정의 점검

Dashboard Plan vs Actual 표의 왼쪽 컬럼은 현재 stage별 기준으로 표시됩니다.

```text
Total  = 해당 stage 전체 대상 수
Done   = 기준일까지 Actual 처리된 수
Remain = Total - Done
```

Progress의 Total Scope는 현재 전체 stage done 상태 기준에 가깝습니다.

이 차이가 의도된 것이 아니라면 Dashboard 우선 원칙에 맞춰 Progress 좌측 요약도 다음처럼 맞추겠습니다.

```text
Total  = stage 대상 수
Done   = actual_date <= asOfDate
Remain = Total - Done
```

단, “전체 완료 상태”를 보여주는 기존 Progress 의미가 필요하다면 label을 분리합니다.

```text
Total Scope Done = 현재 상태 기준 Done
Up to Data Date Actual = 기준일까지 Actual
```

우선은 Dashboard Plan vs Actual 기준과 일치하도록 `Up to asOf` 영역의 Done/Actual 의미를 강화하겠습니다.

### 8. Excel Export도 동일 기준으로 반영

Progress Excel export도 화면과 같은 값을 내보내야 하므로 함께 점검합니다.

대상:

```text
src/lib/schedule-excel-export.ts
```

반영 내용:

```text
좌측 누계 Plan / Actual / Diff
날짜 bucket별 Plan / Actual
Today bucket
Data Date 기준 누계
```

화면과 Excel 값이 다르지 않게 맞추겠습니다.

### 9. 테스트 추가

현재 Dashboard 테스트에는 Today Delay 개선 테스트가 이미 있습니다.

추가할 테스트:

```text
1. Progress day bucket Plan이 Dashboard Data Date Plan과 같은 기준인지 확인
2. Progress day bucket Actual이 Dashboard Data Date Actual과 같은 기준인지 확인
3. Today bucket Plan / Actual이 Dashboard Today Plan / Actual과 같은지 확인
4. 누적 Plan / Actual이 Dashboard To Data Date와 같은지 확인
5. Today Delay는 Dashboard에서 당일 기준으로 유지되는지 확인
6. Progress의 cumulative delay는 planned_date <= asOfDate 기준인지 확인
7. Data Date와 Today label이 서로 다른 Delay 의미를 혼동하지 않도록 확인
```

### 10. 검증 항목

구현 후 아래를 확인하겠습니다.

```text
1. Dashboard Plan vs Actual 값이 기존 개선 로직 그대로 유지되는지
2. Progress Timeline의 Data Date 날짜 bucket이 Dashboard Data Date Plan / Actual과 일치하는지
3. Progress Timeline의 Today 날짜 bucket이 Dashboard Today Plan / Actual과 일치하는지
4. Progress의 Up to Data Date 값이 Dashboard To Data Date 누계와 일치하는지
5. Dashboard Today Delay가 과거 미완료 건을 포함하지 않는지
6. Progress 누적 Delay가 Dashboard Data Date Delay와 같은 누적 기준으로 계산되는지
7. Progress에서 Today Delay라는 표현이 혼동되지 않도록 label이 정리되는지
8. Day / Week bucket 모두 같은 기준으로 동작하는지
9. Stage filter All / Pred / T1 / T2 전환 시 값이 일관되는지
10. Group filter System / Subcontractor / Sub-Sub / PIC / Team 전환 시 값이 일관되는지
11. Team filter 적용 시 Dashboard와 Progress가 같은 대상 데이터로 계산되는지
12. Progress cell 클릭 후 Raw Data 필터가 Plan / Actual 날짜 기준과 맞는지
13. Excel export 값이 화면 값과 일치하는지
14. 기존 Dashboard Plan vs Actual 클릭 필터가 깨지지 않는지
15. 테스트 및 npm run build로 최종 검증
```

## 적용 대상 파일

```text
src/lib/dashboard-utils.ts
src/lib/schedule-utils.ts
src/pages/SchedulePage.tsx
src/components/schedule/ScheduleMatrix.tsx
src/lib/schedule-excel-export.ts
src/test/dashboard-utils.test.ts
```

필요 시 공통 helper를 별도 파일로 분리할 수 있습니다.

```text
src/lib/plan-actual-metrics.ts
```

## 최종 목표

구현 후에는 사용자가 두 화면을 이렇게 이해할 수 있게 됩니다.

```text
Dashboard Plan vs Actual
= 기준일별 Summary

Progress Gantt-lite
= 같은 Summary 로직을 날짜별로 펼친 상세 Timeline
```

그리고 로직 기준은 Dashboard의 개선된 Plan vs Actual 계산을 우선으로 삼겠습니다.

