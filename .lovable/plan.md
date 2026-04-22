
## 검증 결과

현재 `AHU L13-26 South Office` 시스템에서 Today의 Delay가 `15`로 표시되는 원인은 **Today Delay 로직이 “오늘 계획”이 아니라 “오늘 기준 누적 지연”을 계산하고 있기 때문**입니다.

현재 구현은 다음과 같습니다.

```text
Today Plan  = planned_date === today
Today Actual = actual_date === today
Today Delay = planned_date <= today AND stage is not Done
```

즉, Today 영역의 Delay만 누적 기준(`<= today`)으로 계산되어 있습니다.

실제 `AHU L13-26 South Office` 데이터를 확인하면:

```text
Active Subtests: 40

Pred Today Plan: 0
T1 Today Plan:   0
T2 Today Plan:   0

Pred Today Delay current logic: 0
T1 Today Delay current logic:   15
T2 Today Delay current logic:   0
```

Today에 표시되는 `15`는 오늘 계획된 항목이 아니라, **T1 planned date가 2026-04-19이고 아직 Done이 아닌 15건**이 `planned_date <= today` 조건에 걸려 Today Delay로 표시된 것입니다.

## 문제점

Plan vs Actual 표의 Today 영역은 사용자 말씀처럼 “오늘의 계획/실적”을 보여주는 영역입니다.

따라서 Today의 Delay가 과거 미완료 항목까지 포함하면 아래처럼 의미가 섞입니다.

```text
Today Plan = 0
Today Actual = 0
Today Delay = 15
```

이 표시는 사용자가 보기에는 “오늘 계획은 없는데 오늘 지연이 15건”처럼 보여 혼란을 줍니다.

## 수정 방향

Today Delay를 누적 지연이 아닌 **오늘 계획 기준의 지연/미완료 수량**으로 변경하겠습니다.

수정 후 로직:

```text
Today Plan  = planned_date === today
Today Actual = actual_date === today
Today Delay = planned_date === today AND stage is not Done
```

즉:

```text
오늘 계획이 0이면 Today Delay도 0
오늘 계획이 있는 경우에만 Today Delay 계산
과거 지연 항목은 Today Delay에 포함하지 않음
```

과거 미완료/지연 항목은 기존처럼 아래 영역에서 확인됩니다.

```text
To Data Date Δ / Actual
Data Date Delay
Top Overdue
Raw Data overdue filters
```

## 적용할 변경 사항

### 1. Plan vs Actual 집계 로직 수정

`src/lib/dashboard-utils.ts`의 `aggregatePlanActualByGroup()`에서 Today Delay 계산을 변경합니다.

현재:

```text
if (isStageDelayedAsOf(i, stage, today)) todayDelay++
```

변경:

```text
if (isStagePlannedOn(i, stage, today) && !isStageDone(i, stage)) todayDelay++
```

결과적으로 `AHU L13-26 South Office`의 T1 Today Plan이 `0`이면 T1 Today Delay도 `0`으로 표시됩니다.

### 2. Today Delay 클릭 필터 수정

현재 Today Delay 숫자를 클릭하면 Raw Data로 이동할 때 `t1_delay_asof=today` 같은 누적 지연 필터를 사용합니다.

이 필터도 과거 계획 미완료 항목을 포함하므로 Today Delay와 맞지 않습니다.

새 Today Delay 전용 URL 필터를 추가하겠습니다.

```text
pred_delay_on
t1_delay_on
t2_delay_on
```

필터 의미:

```text
planned_date === 해당 날짜
AND stage is not Done
```

예시:

```text
t1_delay_on=2026-04-22
```

이렇게 하면 Today Delay 클릭 시 Raw Data에서도 “오늘 계획 중 미완료 항목”만 표시됩니다.

### 3. Data Date Delay는 기존 의미 유지

Data Date Delay는 현재 “Data Date 기준 누적 지연”으로 동작하고 있습니다.

```text
Data Date Delay = planned_date <= dataDate AND stage is not Done
```

이 값은 Data Date 기준의 backlog/지연 현황을 보는 목적이므로 유지하겠습니다.

### 4. Excel Export 동기화

`src/lib/dashboard-excel-export.ts`에서도 Today Delay 값이 화면과 동일하게 나오도록, 변경된 `todayDelay` 값을 그대로 export하도록 확인합니다.

집계 로직이 수정되면 export는 동일 데이터 객체를 사용하므로 기본적으로 함께 반영됩니다.

### 5. 테스트 추가

`src/test/dashboard-utils.test.ts`에 회귀 테스트를 추가하겠습니다.

검증 케이스:

```text
1. planned_date가 어제이고 Done이 아니어도 Today Delay에는 포함되지 않아야 함
2. planned_date가 오늘이고 Done이 아니면 Today Delay에 포함되어야 함
3. Today Plan이 0이면 Today Delay도 0이어야 함
4. Data Date Delay는 기존처럼 planned_date <= dataDate 기준으로 유지되어야 함
```

## 수정 대상 파일

```text
src/lib/dashboard-utils.ts
src/pages/DashboardPage.tsx
src/pages/SubtestList.tsx
src/test/dashboard-utils.test.ts
```

## 검증 항목

구현 후 아래를 확인하겠습니다.

1. `AHU L13-26 South Office`의 Today Plan이 0이면 Today Delay도 0으로 표시되는지 확인
2. 과거 T1 planned date 2026-04-19 미완료 15건이 Today Delay에서 제외되는지 확인
3. 해당 15건이 Data Date Delay 또는 누적 지연 관련 영역에서는 기존처럼 확인 가능한지 확인
4. Today Delay 클릭 시 Raw Data가 오늘 planned date 기준으로만 필터링되는지 확인
5. Data Date Delay 클릭 필터는 기존 누적 지연 기준으로 유지되는지 확인
6. Excel export의 Today Delay 값이 화면과 동일한지 확인
7. 기존 Plan / Actual / Δ / Data Date Delay 클릭 필터가 깨지지 않는지 확인
8. 테스트 실행 및 `npm run build`로 검증
