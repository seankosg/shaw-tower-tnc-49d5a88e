
# Revised Plan: Yesterday는 Data Date 기준, Today는 실제 오늘 기준 유지

## 핵심 기준

Dashboard의 Plan vs Actual 날짜 기준을 아래처럼 수정합니다.

```text
Data Date = 최신 Import 자료의 Cutoff Date
Today     = 실제 오늘 날짜
```

예시:

```text
최신 Import Data Date = 2026-04-21
실제 오늘 날짜         = 2026-04-22

Dashboard 표시:
Data Date (21-Apr)
Today (22-Apr)
```

기존에 Cutoff Date 의미로 사용되던 `Yesterday` 명칭은 화면과 Excel에서 `Data Date`로 변경합니다.

---

## 변경 목표

현재 Dashboard의 `Yesterday`는 단순히 `Today - 1 day`로 계산되고 있습니다.

이를 다음처럼 변경합니다.

```text
기존:
Yesterday = 실제 오늘 - 1일
Today     = 실제 오늘

변경:
Data Date = 최신 완료 Import의 data_date
Today     = 실제 오늘
```

즉, 운영상 전일 마감 자료를 의미하는 부분은 더 이상 `Yesterday`라고 표시하지 않고, 명확하게 `Data Date`로 표시합니다.

---

## 1. Dashboard에서 최신 Import Data Date 조회

대상 파일:

```text
src/pages/DashboardPage.tsx
```

Dashboard 로딩 시 `upload_batches`에서 최신 완료 import의 `data_date`를 조회합니다.

조회 기준:

```text
status = completed
data_date is not null
order by data_date desc, uploaded_at desc
limit 1
```

조회 결과를 Plan vs Actual의 Data Date 기준일로 사용합니다.

```text
dataDate = latest completed import data_date
today    = todayIso()
```

예시:

```text
dataDate = 2026-04-21
today    = 2026-04-22
```

만약 완료된 import의 `data_date`가 없으면 기존 방식으로 fallback합니다.

```text
dataDate = today - 1 day
```

---

## 2. Plan vs Actual 계산 기준 변경

대상 파일:

```text
src/lib/dashboard-utils.ts
```

현재 `aggregatePlanActualByGroup()` 함수는 `today`만 받고 내부에서 `yesterdayIso(today)`를 계산합니다.

기존 구조:

```typescript
aggregatePlanActualByGroup(subs, today, groupKey, groupLabel)
```

변경 후 구조:

```typescript
aggregatePlanActualByGroup(subs, today, dataDate, groupKey, groupLabel)
```

날짜 의미:

```text
dataDate = 최신 Import Data Date
today    = 실제 오늘 날짜
```

계산 기준:

```text
To Data Date Cumulative:
planned_date <= dataDate
actual_date  <= dataDate

Data Date:
planned_date == dataDate
actual_date  == dataDate

Today:
planned_date == today
actual_date  == today
```

---

## 3. 화면 명칭 변경: Yesterday → Data Date

대상 파일:

```text
src/pages/DashboardPage.tsx
src/lib/dashboard-excel-export.ts
```

Cutoff Date 의미로 쓰이던 `Yesterday` 명칭은 모두 `Data Date`로 변경합니다.

기존 표시:

```text
To-Yesterday (Cumulative)
Yesterday
Today
```

변경 표시:

```text
To Data Date (Cumulative)
Data Date (21-Apr)
Today (22-Apr)
```

날짜 표기는 `dd-mmm` 형식으로 표시합니다.

예시:

```text
2026-04-21 → 21-Apr
2026-04-22 → 22-Apr
```

이미 존재하는 `formatDdMmm()` 유틸리티를 활용합니다.

대상 파일:

```text
src/lib/format.ts
```

---

## 4. Predecessor 지연 누락 문제 해결

사용자가 언급한 항목들은 Raw Data상 Predecessor stage에서 지연 상태입니다.

```text
Elec-019-MST-048-2
Elec-019-MST-062-2
Elec-037
Elec-038
Elec-039
Elec-040
```

이 항목들은 계획일이 Data Date보다 이전인데 아직 완료되지 않았기 때문에, 단순히 `planned_date == Data Date` 또는 `planned_date == Today` 조건으로는 Plan vs Actual에 표시되지 않을 수 있습니다.

이를 해결하기 위해 Plan vs Actual에 Delay / Backlog 값을 추가합니다.

Predecessor Delay 조건:

```text
pred_planned_date <= 기준일
AND pred_status != Done
```

Data Date Delay:

```text
pred_planned_date <= dataDate
AND pred_status != Done
```

Today Delay:

```text
pred_planned_date <= today
AND pred_status != Done
```

예시:

```text
Data Date = 2026-04-21
Today     = 2026-04-22

pred_planned_date = 2026-04-19
pred_status       = Planned
```

결과:

```text
Data Date Delay에 포함
Today Delay에도 포함
```

---

## 5. T1 / T2 Delay도 동일 기준 적용

Predecessor뿐 아니라 T1, T2도 동일한 방식으로 Delay를 계산합니다.

T1 Delay:

```text
t1_planned_date <= 기준일
AND t1_status != Done
```

T2 Delay:

```text
t2_planned_date <= 기준일
AND t2_status != Done
```

이렇게 하면 각 stage별 누적 지연 물량을 Plan vs Actual에서 확인할 수 있습니다.

---

## 6. Plan vs Actual 컬럼 구성

대상 파일:

```text
src/pages/DashboardPage.tsx
src/lib/dashboard-utils.ts
```

기존 Plan / Actual / Δ 값은 유지하고, Data Date와 Today 영역에 Delay를 추가합니다.

권장 구조:

```text
To Data Date (Cumulative)
Plan | Actual | Δ

Data Date (21-Apr)
Plan | Actual | Δ | Delay

Today (22-Apr)
Plan | Actual | Δ | Delay
```

화면 폭이 너무 넓어지는 경우에는 `Δ` 옆에 Delay badge로 표시합니다.

예시:

```text
Δ -2
Delay 6
```

우선순위:

```text
1. 기존 Plan / Actual / Δ 값 유지
2. 지연 backlog는 Delay로 별도 표시
3. 화면 폭이 과도하게 넓어지지 않도록 compact layout 적용
```

---

## 7. Delay 클릭 시 Subtest List 필터 연결

대상 파일:

```text
src/pages/DashboardPage.tsx
src/pages/SubtestList.tsx
```

Delay 숫자를 클릭하면 해당 기준일의 지연 항목만 Subtest List에서 확인할 수 있게 합니다.

추가할 URL 필터:

```text
pred_delay_asof
t1_delay_asof
t2_delay_asof
```

Predecessor Data Date Delay 클릭 시:

```text
/subtests?pred_delay_asof=2026-04-21
```

필터 조건:

```text
pred_planned_date <= 2026-04-21
AND pred_status != Done
```

Predecessor Today Delay 클릭 시:

```text
/subtests?pred_delay_asof=2026-04-22
```

필터 조건:

```text
pred_planned_date <= 2026-04-22
AND pred_status != Done
```

T1, T2도 동일하게 연결합니다.

```text
/subtests?t1_delay_asof=2026-04-21
/subtests?t2_delay_asof=2026-04-21
```

---

## 8. Excel Export 반영

대상 파일:

```text
src/lib/dashboard-excel-export.ts
```

Excel Export도 Dashboard와 동일한 날짜 기준 및 명칭을 사용합니다.

기존 meta 예시:

```text
Base date: 2026-04-22 · Yesterday: 2026-04-21
```

변경 meta 예시:

```text
Today: 2026-04-22 · Data Date: 2026-04-21
```

기존 컬럼:

```text
To-Yesterday (Cumulative)
Yesterday
Today
```

변경 컬럼:

```text
To Data Date (Cumulative)
Data Date (21-Apr)
Today (22-Apr)
```

Excel에도 Delay 값을 포함합니다.

```text
Data Date Delay
Today Delay
```

---

## 예상 결과

수정 후 Dashboard는 다음 기준으로 동작합니다.

```text
Data Date = 최신 Import data_date
Today     = 실제 오늘 날짜
```

예시:

```text
Latest Import Data Date = 2026-04-21
Actual Today            = 2026-04-22
```

Plan vs Actual 의미:

```text
To Data Date:
2026-04-21까지의 누적 계획 / 실적

Data Date (21-Apr):
2026-04-21 Import 자료 기준 당일 계획 / 실적

Today (22-Apr):
2026-04-22 실제 오늘 계획 / 실적
```

지연 항목 의미:

```text
Data Date Delay:
planned_date <= 2026-04-21
AND status != Done

Today Delay:
planned_date <= 2026-04-22
AND status != Done
```

따라서 사용자가 언급한 Predecessor 지연 항목들은 Plan vs Actual에서 누락되지 않고 Delay로 확인됩니다.

---

## 검증 항목

구현 후 아래를 확인합니다.

```text
- Dashboard의 Data Date가 최신 completed import의 data_date를 사용하는지
- Dashboard의 Today가 실제 오늘 날짜를 사용하는지
- Cutoff Date 의미의 Yesterday 명칭이 Data Date로 변경되었는지
- Data Date 헤더에 dd-mmm 형식 날짜가 괄호로 표시되는지
- Today 헤더에도 dd-mmm 형식 날짜가 괄호로 표시되는지
- To-Yesterday가 To Data Date로 변경되었는지
- Today 계획 KPI가 기존처럼 실제 오늘 기준으로 유지되는지
- Elec-019-MST-048-2가 Pred Data Date Delay에 포함되는지
- Elec-019-MST-062-2가 Pred Data Date Delay에 포함되는지
- Elec-037, Elec-038, Elec-039, Elec-040이 Pred Data Date Delay에 포함되는지
- 동일 항목들이 Pred Today Delay에도 포함되는지
- Delay 클릭 시 Subtest List가 정확히 필터링되는지
- T1 / T2 Delay도 동일한 기준으로 동작하는지
- Excel Export의 날짜 기준, 명칭, Delay 값이 Dashboard와 일치하는지
- Import 기록이 없는 경우 fallback이 정상 동작하는지
- 빌드가 정상 통과하는지
```
