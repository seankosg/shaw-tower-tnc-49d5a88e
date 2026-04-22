

## 확인 결과

현재 코드 기준으로는 **완전히 안전하게 리셋된다고 보기 어렵습니다.**

동작을 나누면 아래와 같습니다.

```text
1. Dashboard / Progress에서 URL로 넘긴 필터
   → 대체로 새 URL로 교체되므로 기존 URL 필터는 사라집니다.

2. Raw Data / Subtest List 화면 안에서 사용자가 걸었던 컬럼 필터, 검색어, 정렬 상태
   → localStorage에 저장되어 다시 적용됩니다.

3. 따라서 Dashboard 필터로 만들어진 Subtest list 상태에서
   Progress로 이동해 새로운 Gantt 필터를 걸어 들어오면
   URL 필터는 새 기준으로 바뀌지만,
   기존 Raw Data의 검색어/컬럼 필터가 남아 결과를 추가로 좁힐 수 있습니다.
```

즉 사용자가 기대하는 동작인 아래 상태는 현재 보장되지 않습니다.

```text
Progress Gantt 클릭
→ 기존 Dashboard/Raw Data 필터는 리셋
→ Progress에서 클릭한 조건만으로 Subtest list 표시
```

현재는 아래처럼 될 가능성이 있습니다.

```text
Progress Gantt 클릭 조건
+ 이전 Raw Data 검색어
+ 이전 Raw Data 컬럼 필터
+ 이전 정렬/테이블 상태 일부
= 사용자가 예상보다 적은 Subtest list를 보게 됨
```

## 개선 목표

Progress, Dashboard, Critical, Lookup 등에서 Subtest List로 이동할 때는 **이동 출처에서 넘긴 필터를 기준으로 Raw Data 목록을 새로 구성**하도록 개선하겠습니다.

특히 이번 요청의 핵심인 Progress Gantt 클릭은 다음을 보장하겠습니다.

```text
Progress Gantt Plan 클릭
→ 기존 Dashboard/Raw Data 필터 제거
→ planned date + stage + group 조건만 적용

Progress Gantt Actual 클릭
→ 기존 Dashboard/Raw Data 필터 제거
→ actual date + Done + stage + group 조건만 적용
```

## 개선 방향

### 1. Subtest List 진입 출처를 명확히 구분

현재 Progress Gantt 클릭은 이미 아래 파라미터를 사용합니다.

```text
source=schedule_cell
```

이를 더 적극적으로 사용하겠습니다.

추가로 Progress의 날짜 Lookup, KPI 클릭도 필요하면 출처를 명확히 붙입니다.

```text
source=schedule_lookup
source=schedule_kpi
```

Dashboard에서 들어오는 필터도 구분 가능하도록 정리합니다.

```text
source=dashboard
```

이렇게 하면 Raw Data 화면이 다음을 판단할 수 있습니다.

```text
사용자가 직접 Raw Data에서 필터링 중인가?
Dashboard에서 넘어온 필터인가?
Progress에서 넘어온 필터인가?
```

### 2. 외부 화면에서 들어온 경우 기존 테이블 필터 초기화

`SubtestList.tsx`의 초기화 로직을 수정합니다.

현재는 localStorage에서 아래 상태를 불러옵니다.

```text
columnFilters
globalFilter
sorting
columnSizing
```

개선 후에는 `source`가 있는 URL로 진입한 경우 다음처럼 처리합니다.

```text
source=dashboard 또는 source=schedule_cell 또는 source=schedule_lookup 등
→ 기존 columnFilters 제거
→ 기존 globalFilter/searchInput 제거
→ URL로 넘어온 필터만 적용
```

정렬과 컬럼 폭은 사용성 설정에 가까우므로 유지할 수 있습니다.

```text
유지:
- sorting
- columnSizing

초기화:
- columnFilters
- globalFilter
- searchInput
```

### 3. Progress Gantt 클릭 시 필터 충돌 방지

Progress Gantt 클릭으로 생성되는 URL은 다음만 포함되도록 유지/정리합니다.

```text
source=schedule_cell
group filter:
- system
- subcon
- subsub
- hdec_pic
- team

date filter:
- date_from
- date_to
- date_field

stage filter:
- stage

actual filter:
- cell_status=Done
```

그리고 Raw Data에서 기존의 다음 필터들이 남지 않게 하겠습니다.

```text
status=overdue
status=at_risk
pred_status
t1_status
t2_status
이전 date filter
이전 검색어
이전 컬럼 필터
```

### 4. Dashboard에서 넘어온 필터도 동일하게 정리

Dashboard의 KPI, Plan vs Actual, Pie chart, Alert 클릭도 Subtest List로 이동할 때 `source=dashboard`를 붙이겠습니다.

그러면 다음 흐름도 명확해집니다.

```text
Dashboard 클릭
→ Dashboard 조건만 적용

이후 Progress 클릭
→ Dashboard 조건 제거
→ Progress 조건만 적용

이후 Dashboard 다시 클릭
→ Progress 조건 제거
→ Dashboard 조건만 적용
```

### 5. 필터 배너 문구 개선

현재 Progress에서 넘어와도 Raw Data 상단에 다음처럼 표시될 수 있습니다.

```text
Filtered from Dashboard:
```

이를 출처에 따라 바꾸겠습니다.

```text
source=dashboard       → Filtered from Dashboard:
source=schedule_cell   → Filtered from Progress:
source=schedule_lookup → Filtered from Progress:
기타 URL 필터          → Active URL filters:
```

사용자 입장에서는 현재 목록이 어떤 화면에서 만들어졌는지 더 명확해집니다.

### 6. Clear 동작 정리

현재 Gantt 날짜 필터 chip을 지우면 일부 관련 파라미터를 함께 제거합니다.

이를 유지하면서, 출처별 clear 동작을 더 명확히 하겠습니다.

```text
Progress 필터 chip 제거
→ date_from
→ date_to
→ date_field
→ stage
→ cell_status
→ source
함께 제거
```

`Clear all`은 URL 필터뿐 아니라 외부 진입으로 인해 적용된 column/global filter도 완전히 비워진 상태가 되도록 보정하겠습니다.

## 수정 대상

```text
src/pages/SubtestList.tsx
src/pages/SchedulePage.tsx
src/pages/DashboardPage.tsx
```

필요 시 테스트 보강:

```text
src/test/dashboard-utils.test.ts
```

또는 별도 테스트 추가:

```text
src/test/subtest-url-filter.test.ts
```

## 검증 항목

구현 후 아래를 확인하겠습니다.

```text
1. Dashboard에서 필터 클릭 후 Raw Data 진입
   → Dashboard 조건만 표시

2. 그 상태에서 Progress로 이동 후 Gantt Plan 클릭
   → 기존 Dashboard URL 필터 제거
   → 기존 Raw Data 검색어/컬럼 필터 제거
   → Progress Plan 조건만 표시

3. Progress Gantt Actual 클릭
   → actual date + Done 조건만 적용
   → 이전 Dashboard/Raw Data 필터 미적용

4. Raw Data에서 직접 검색어 입력 후 Progress Gantt 클릭
   → 기존 검색어 제거
   → Progress 클릭 조건만 적용

5. Raw Data에서 컬럼 필터 적용 후 Progress Gantt 클릭
   → 기존 컬럼 필터 제거
   → Progress 클릭 조건만 적용

6. Progress에서 넘어온 경우 상단 배너가
   “Filtered from Progress”로 표시

7. Dashboard에서 넘어온 경우 상단 배너가
   “Filtered from Dashboard”로 표시

8. Clear all 클릭 시 URL 필터와 외부 진입 필터 상태가 깔끔하게 제거

9. Progress Gantt Plan 셀 숫자와 Raw Data 결과 수가 일치

10. Progress Gantt Actual 셀 숫자와 Raw Data 결과 수가 일치
```

## 최종 동작

개선 후 사용자는 다음 흐름을 기대할 수 있습니다.

```text
Dashboard 필터 결과를 보고 있던 중
→ Progress 이동
→ Gantt의 다른 Plan/Actual 셀 클릭
→ 기존 Dashboard/Raw Data 필터는 모두 리셋
→ 새로 클릭한 Progress 조건 기준으로만 Subtest list 표시
```

