
## 검토 결과

현재 Plan vs Actual Breakdown의 **Data Date → Plan**과 **Today → Plan**은 모두 Stage별 planned date를 기준으로 집계하도록 구현되어 있습니다.

현재 코드 기준 로직은 다음과 같습니다.

```text
Predecessor Plan = pred_planned_date 기준
T1 Plan          = t1_planned_date 기준
T2 Plan          = t2_planned_date 기준
```

그리고 컬럼별 계산 기준은 아래와 같습니다.

```text
To Data Date Plan = planned_date <= dataDate
Data Date Plan    = planned_date === dataDate
Today Plan        = planned_date === today
```

즉, 의도 자체는 맞습니다.

다만 실제 누락처럼 보이는 원인은 두 가지 가능성이 있습니다.

## 확인된 데이터 기준

현재 backend 데이터 기준으로 확인한 결과:

```text
Latest Data Date = 2026-04-21

2026-04-22 planned 항목:
- Predecessor: 8
- T1: 2
- T2: 18

Data Date(2026-04-21) planned 항목:
- Predecessor: 0
- T1: 1
- T2: 0
```

System별로는 예를 들어:

```text
Fire Lift
- Pred Today Plan: 8

Lighting / Smart Lighting
- T1 Today Plan: 2

DXFCU L1 FCC
- T2 Today Plan: 6

DXFCU L1 FMO
- T2 Today Plan: 6
```

따라서 Raw Data에는 2026-04-22 planned 항목이 실제로 존재합니다.

## 의심되는 문제

### 1. Today 기준일이 UTC로 계산될 가능성

현재 `todayIso()`는 다음처럼 UTC 기반입니다.

```ts
new Date().toISOString().slice(0, 10)
```

이 방식은 사용자의 현지 날짜와 다르게 계산될 수 있습니다.  
예를 들어 사용자가 현지 시간으로 2026-04-22에 접속했어도, 브라우저/UTC 기준에 따라 앱 내부 today가 2026-04-21로 잡힐 수 있습니다.

이 경우:

```text
Raw Data에는 2026-04-22 planned 항목 존재
하지만 Dashboard Today 기준은 2026-04-21
→ Today Plan에 2026-04-22 항목이 카운트되지 않음
```

### 2. Data Date와 Today가 서로 다른 날짜임

현재 Data Date는 최신 import 기준으로 `2026-04-21`입니다.

따라서 `2026-04-22` planned 항목은:

```text
Today Plan에는 들어가야 함
Data Date Plan에는 들어가면 안 됨
To Data Date Cumulative Plan에도 아직 들어가면 안 됨
```

즉, Data Date 컬럼에서 2026-04-22 항목이 안 보이는 것은 정상입니다.  
하지만 Today 컬럼에서 안 보이면 기준일 계산 문제일 가능성이 큽니다.

## 수정 목표

Plan vs Actual Breakdown에서 Stage별 Plan 값이 아래 기준으로 정확히 카운트되도록 정리하겠습니다.

```text
Predecessor:
- To Data Date Plan = pred_planned_date <= dataDate
- Data Date Plan    = pred_planned_date === dataDate
- Today Plan        = pred_planned_date === localToday

T1:
- To Data Date Plan = t1_planned_date <= dataDate
- Data Date Plan    = t1_planned_date === dataDate
- Today Plan        = t1_planned_date === localToday

T2:
- To Data Date Plan = t2_planned_date <= dataDate
- Data Date Plan    = t2_planned_date === dataDate
- Today Plan        = t2_planned_date === localToday
```

## 구현 계획

### 1. todayIso()를 로컬 날짜 기준으로 수정

`src/lib/stage-metrics.ts`의 `todayIso()`를 UTC 기준이 아닌 브라우저 로컬 날짜 기준으로 변경합니다.

현재:

```ts
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
```

수정 방향:

```ts
export function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
```

이렇게 하면 Today 컬럼의 기준일이 실제 사용자가 보는 날짜와 일치합니다.

### 2. Dashboard의 Plan 집계 로직을 명확하게 분리

`aggregatePlanActualByGroup()`의 현재 로직은 동작은 맞지만 변수명이 `yesterdayPlan`으로 되어 있어 Data Date 컬럼과 혼동될 수 있습니다.

현재 구조:

```text
yesterdayPlan   → 실제로는 Data Date Plan
yesterdayActual → 실제로는 Data Date Actual
yesterdayDelay  → 실제로는 Data Date Delay
```

기능 변경 없이 내부 의미를 명확히 하겠습니다.

수정 방향:

```text
dataDatePlan
dataDateActual
dataDateDelay
todayPlan
todayActual
todayDelay
```

단, 화면 표시와 Excel export가 깨지지 않도록 타입과 사용부를 함께 정리합니다.

### 3. Stage별 planned date 매핑 검증

아래 함수가 Stage별로 정확한 planned date를 반환하는지 다시 확인하고, 필요하면 테스트를 추가합니다.

```ts
getStagePlannedDate(row, 'pred') → pred_planned_date
getStagePlannedDate(row, 't1')   → t1_planned_date
getStagePlannedDate(row, 't2')   → t2_planned_date
```

이 매핑은 현재 코드상 맞지만, 재발 방지를 위해 테스트로 고정하겠습니다.

### 4. Data Date Plan과 Today Plan 단위 테스트 추가

`aggregatePlanActualByGroup()`에 대해 테스트 데이터를 만들어 아래 케이스를 검증합니다.

```text
dataDate = 2026-04-21
today    = 2026-04-22
```

검증 내용:

```text
pred_planned_date = 2026-04-21 → Pred Data Date Plan +1
pred_planned_date = 2026-04-22 → Pred Today Plan +1

t1_planned_date = 2026-04-21 → T1 Data Date Plan +1
t1_planned_date = 2026-04-22 → T1 Today Plan +1

t2_planned_date = 2026-04-21 → T2 Data Date Plan +1
t2_planned_date = 2026-04-22 → T2 Today Plan +1
```

그리고 잘못된 Stage에 섞이지 않는지도 확인합니다.

```text
pred_planned_date가 T1 Plan에 들어가지 않음
t1_planned_date가 T2 Plan에 들어가지 않음
t2_planned_date가 Pred Plan에 들어가지 않음
```

### 5. Raw Data 이동 필터도 동일 기준으로 검증

Plan 숫자 클릭 시 URL 필터가 정확히 생성되는지 확인합니다.

```text
Data Date Plan 클릭:
- pred_planned_on=2026-04-21
- t1_planned_on=2026-04-21
- t2_planned_on=2026-04-21

Today Plan 클릭:
- pred_planned_on=2026-04-22
- t1_planned_on=2026-04-22
- t2_planned_on=2026-04-22
```

Raw Data 쪽 필터 로직은 현재 아래처럼 정확히 equality 비교를 하고 있습니다.

```ts
r.pred_planned_date === urlPredPlannedOn
r.t1_planned_date === urlT1PlannedOn
r.t2_planned_date === urlT2PlannedOn
```

따라서 Dashboard에서 넘기는 날짜가 올바르면 Raw Data도 정확히 필터링됩니다.

### 6. SubtestList의 today fallback도 통일

`src/pages/SubtestList.tsx`에 남아 있는 UTC 기반 today fallback도 `todayIso()`로 통일합니다.

대상 예:

```ts
new Date().toISOString().slice(0, 10)
```

수정 후:

```ts
todayIso()
```

이렇게 하면 Dashboard와 Raw Data의 날짜 기준이 동일해집니다.

## 수정 대상 파일

```text
src/lib/stage-metrics.ts
src/lib/dashboard-utils.ts
src/pages/DashboardPage.tsx
src/pages/SubtestList.tsx
src/lib/dashboard-excel-export.ts
src/test/dashboard-utils.test.ts
```

## 검증 항목

구현 후 아래를 확인하겠습니다.

1. Today 라벨이 실제 로컬 날짜 기준으로 표시되는지 확인
2. 2026-04-22 planned 항목이 Today Plan에 카운트되는지 확인
3. 2026-04-21 planned 항목이 Data Date Plan에 카운트되는지 확인
4. Pred / T1 / T2 각각의 Plan 값이 각 Stage planned date에서만 집계되는지 확인
5. 다른 Stage planned date가 섞여 카운트되지 않는지 확인
6. Data Date Plan 클릭 시 Raw Data에서 해당 Stage + 해당 날짜만 표시되는지 확인
7. Today Plan 클릭 시 Raw Data에서 해당 Stage + 2026-04-22만 표시되는지 확인
8. Excel export의 Data Date / Today Plan 값도 화면과 동일하게 나오는지 확인
9. 기존 Delay / Actual / Δ 클릭 필터가 깨지지 않는지 확인
10. `npm run build`와 테스트 실행으로 검증
