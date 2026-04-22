
# Plan: Dashboard Overdue에 Predecessor 포함

## 목표

Dashboard 상단 헤더 카드의 **Overdue** 집계가 현재 T1/T2만 기준으로 계산되는 것을 수정하여, 아래 조건의 **Predecessor Overdue**도 포함되도록 변경합니다.

```text
Predecessor Planned Date < Today
AND Predecessor Status != Done
```

즉 한 Subtest가 Predecessor, T1, T2 중 하나라도 overdue이면 Dashboard의 Overdue Subtests에 포함됩니다.

## 변경 범위

### 1. Dashboard 공통 overdue 판정 로직 수정

`src/lib/dashboard-utils.ts`

현재 `isOverdue()`는 T1/T2만 검사합니다.

변경 후:

```text
Pred overdue OR T1 overdue OR T2 overdue
```

으로 계산되도록 수정합니다.

또한 `maxDelayDays()`도 Predecessor 지연일을 포함하도록 수정합니다.  
이 함수는 Dashboard의 Top Overdue 정렬에 사용되므로, Predecessor가 가장 오래 지연된 경우에도 상단에 올바르게 표시됩니다.

## 2. Dashboard UI 반영

`src/pages/DashboardPage.tsx`

Dashboard의 Overdue 카드와 Overdue Alert Banner는 이미 `isOverdue()` 기반으로 계산하고 있으므로, 공통 함수 수정만으로 아래 영역에 자동 반영됩니다.

- 상단 Header KPI 카드: `Overdue`
- Alert Banner: `N Overdue Subtests`
- Top Overdue 목록
- Breakdown 테이블 내 overdue 기반 클릭/집계 중 `isOverdue()`를 사용하는 부분

이미 Stage Card에는 `predOverdue`가 별도로 계산되어 있으므로, Predecessor 카드의 overdue 수치는 유지됩니다.

## 3. Overdue 카드 클릭 후 Subtest List 필터도 동일하게 수정

`src/pages/SubtestList.tsx`

Dashboard의 Overdue 카드를 클릭하면 `/?status=overdue`로 이동합니다.

현재 Subtest List의 `status=overdue` 필터도 T1/T2만 검사하고 있으므로, Dashboard 숫자와 실제 목록이 불일치하지 않도록 아래 조건을 추가합니다.

```text
Pred Planned < Today AND Pred Status != Done
```

따라서 Dashboard Overdue 카드 숫자와 클릭 후 표시되는 Subtest 목록이 일치하게 됩니다.

## 4. At-Risk는 이번 변경에 포함하지 않음

요청 범위는 **Overdue Subtests 카드에 Predecessor Overdue 포함**이므로, At-Risk 계산은 기존 T1/T2 기준을 유지합니다.

필요하면 다음 단계에서 At-Risk도 Predecessor 포함으로 확장할 수 있습니다.

## 예상 결과

변경 후 Dashboard Overdue는 다음과 같이 계산됩니다.

```text
Overdue Subtests =
Subtests where any of the following is true:

1. pred_planned_date < today AND pred_status != Done
2. t1_planned_date < today AND t1_status != Done
3. t2_planned_date < today AND t2_status != Done
```

중복 카운트는 하지 않습니다.  
하나의 Subtest가 Pred/T1/T2 모두 overdue여도 Overdue Subtests에는 1건으로 계산됩니다.
