
# 구현 계획: Dashboard Overdue와 Progress Icon 지연 기준을 Data Date로 통일

## 목표

Dashboard의 Overdue 관련 숫자/필터와 Subtest List의 Progress Icon/행 강조가 모두 동일하게 아래 기준을 사용하도록 통일합니다.

```text
Delay / Overdue 기준:
planned_date <= Data Date
AND 해당 stage가 Done이 아님
```

즉, 오늘 날짜가 아니라 최신 완료 Import의 `data_date`를 기준으로 판단합니다.

## 변경 범위

### 1. 공통 지연 판단 기준 정리

`src/lib/dashboard-utils.ts`에서 Dashboard용 Overdue helper가 현재 `today` 기준 및 일부 `< today` 로직을 사용하고 있으므로, 공통 stage metric 기준과 맞춥니다.

변경 방향:

```ts
isOverdue(row, asOfDate)
→ Pred / T1 / T2 중 하나라도 isStageDelayedAsOf(row, stage, asOfDate) 이면 true

maxDelayDays(row, asOfDate)
→ Data Date 기준 최대 지연일 계산
```

`isStageDelayedAsOf`는 이미 아래 기준입니다.

```text
planned_date <= asOfDate && !Done
```

### 2. Dashboard Overdue KPI를 Data Date 기준으로 변경

`src/pages/DashboardPage.tsx`에서 현재 Overdue 계산에 `today`가 사용되는 부분을 `dataDate`로 변경합니다.

대상:

- 상단 `Overdue` KPI
- `Predecessor / T1 / T2` Stage Card의 `OD` 숫자
- `Overdue Subtests` AlertBanner
- `Top 10 Overdue Subtests`
- `Days Late` 계산

변경 후 Dashboard의 Overdue는 모두 다음 기준입니다.

```text
Pred / T1 / T2 중 planned_date <= dataDate 이고 Done이 아닌 stage가 하나라도 있으면 Overdue
```

### 3. Dashboard에서 Subtest List로 이동할 때 Data Date 전달

Dashboard의 Overdue 클릭 이동을 아래처럼 변경합니다.

현재:

```text
/?status=overdue
```

변경:

```text
/?status=overdue&as_of={dataDate}
```

대상:

- Overdue KPI 카드
- Overdue AlertBanner
- Plan vs Actual 누적 Δ 클릭 중 `status=overdue`로 이동하는 부분
- 필요한 경우 Top/Breakdown 관련 Overdue 링크

이렇게 하면 Dashboard 숫자와 클릭 후 Subtest List 필터 결과가 같은 Data Date 기준으로 일치합니다.

### 4. Subtest List Overdue 필터 기본값을 Data Date 기준으로 변경

`src/pages/SubtestList.tsx`에서 현재 URL status filter가 아래처럼 동작합니다.

```ts
const today = urlAsOf || new Date().toISOString().slice(0, 10);
```

이를 다음 의미로 바꿉니다.

```text
asOfDateForDelay =
  URL의 as_of가 있으면 그 날짜
  없으면 latest Data Date
  latest Data Date도 아직 로딩 전이면 today fallback
```

즉, 직접 `/?status=overdue`로 들어와도 Data Date 기준으로 필터링되게 합니다.

### 5. Progress Icon과 행 강조 기준을 동일하게 변경

Progress Icon은 이미 `asOfDate={dataDate}`를 받아 Data Date 기준으로 표시하고 있습니다.

다만 Subtest List 행 배경 강조(`renderRowBgClass`)는 아직 Today 기준입니다.

현재:

```ts
getAnyStageDelayedAsOf(row, allStages, today)
```

변경:

```ts
getAnyStageDelayedAsOf(row, allStages, delayAsOfDate)
```

따라서 아래가 모두 같은 기준이 됩니다.

- Progress Icon 빨간 지연 표시
- Subtest List Overdue 필터 결과
- Subtest List 행 배경 강조
- Dashboard Overdue KPI/Alert/Top 10

### 6. 문구 보정

사용자 혼동을 줄이기 위해 Dashboard의 Overdue 설명을 Data Date 기준임을 알 수 있게 수정합니다.

예:

```text
Planned date is on/before Data Date and not yet Done.
```

또는

```text
Overdue as of Data Date.
```

Progress Icon tooltip은 기존처럼 유지합니다.

```text
Delay as of {Data Date}
```

### 7. At-Risk는 기존 역할 유지

At-Risk는 “앞으로 임박한 계획”을 보여주는 성격이므로 Today 기준의 upcoming 판단은 유지하되, Overdue 제외 기준은 Data Date 기준과 충돌하지 않도록 정리합니다.

예상 동작:

```text
Data Date = Apr 21
Today = Apr 22
Planned Date = Apr 22
Done 아님

Overdue: 아님
At-Risk: 될 수 있음
Progress Icon: 지연 아님
```

### 8. 검증 항목

구현 후 아래를 확인합니다.

1. LF-016 / LF-017
   - Data Date가 Apr 21이고 Pred Planned가 Apr 22라면 Dashboard Overdue에서 제외
   - Subtest List `status=overdue`에서도 제외
   - Progress Icon에서도 지연 표시 없음

2. Dashboard
   - Overdue KPI 숫자와 Overdue Alert 숫자 일치
   - Top 10 Overdue가 Data Date 기준으로만 표시
   - Stage Card의 Pred/T1/T2 OD 숫자가 Data Date 기준으로 표시

3. Dashboard → Subtest List 이동
   - Overdue KPI 클릭 후 표시되는 Subtest List row count가 Dashboard Overdue count와 일치
   - URL에 `as_of={dataDate}`가 포함됨

4. Subtest List
   - Progress Icon 빨간 표시와 `status=overdue` 필터 결과가 동일 기준
   - 행 배경 강조도 Progress Icon과 동일 기준

5. Build
   - TypeScript build 통과
