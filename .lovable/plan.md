
## 변경 목표

Progress 페이지(`/schedule`)에서 상단 Summary 카드의 기준을 `Data Date`로 고정하고, Matrix의 `As-of` 토글 기능은 유지하되 기본 선택값을 `Data Date`로 변경하겠습니다.

## 구현 계획

### 1. Matrix As-of 토글 기본값 변경

현재 기본값은 `Today`입니다.

```ts
const [asOfMode, setAsOfMode] = useState<'dataDate' | 'today'>('today');
```

이를 `Data Date`가 기본 선택되도록 변경하겠습니다.

```ts
const [asOfMode, setAsOfMode] = useState<'dataDate' | 'today'>('dataDate');
```

결과:
- 페이지 진입 시 Matrix 누적 Plan/Actual 컬럼은 기본적으로 `Up to Data Date`
- 사용자가 원하면 Toolbar에서 `Today`로 전환 가능
- Matrix의 기존 As-of 기능은 유지

### 2. Delay 카드 문구 수정

현재 상단 Summary 카드 제목은 선택된 `asOfLabel`에 따라 바뀝니다.

```text
Delay up to Today
Delay up to Data Date
```

이를 항상 아래 문구로 고정하겠습니다.

```text
Delay Up to Data Date
```

### 3. Delay 카드 로직을 Data Date 기준으로 고정

현재 Delay 계산은 `asOfDate`를 사용하고 있어, As-of 토글이 `Today`이면 Today 기준으로 계산됩니다.

상단 Summary 카드의 Delay는 항상 `dataDate` 기준으로 계산되도록 수정하겠습니다.

```ts
isStageDelayedAsOf(s, stage, dataDate)
```

즉:
- planned date <= Data Date
- 아직 완료되지 않은 Stage

만 Delay로 집계됩니다.

### 4. Delay 카드 클릭 필터도 Data Date 기준으로 수정

현재 Delay 카드를 클릭하면 Subtest List로 이동할 때 선택된 `asOfDate`가 전달됩니다.

이를 항상 `dataDate`로 변경하겠습니다.

```text
/?source=schedule_kpi&status=overdue&as_of={dataDate}
```

결과:
- 카드에 표시된 Delay 수량
- 클릭 후 Subtest List 결과

두 값이 동일한 `Data Date` 기준으로 맞춰집니다.

### 5. Cumulative Progress를 Data Date 기준으로 수정

현재 `Cumulative Progress`는 완료 여부 기준으로 계산되어, `Data Date` 이후 완료된 Actual도 포함될 수 있습니다.

이를 Data Date 기준 누적 Actual로 변경하겠습니다.

계산 방식:
- 분모: 현재 선택된 Stage 필터 기준 전체 Stage 수
  - `All`: subtests × 3
  - `Pred`, `T1`, `T2`: subtests × 1
- 분자: actual date <= Data Date 인 Stage 수

예시:

```ts
isStageActualUpTo(s, stage, dataDate)
```

### 6. Cumulative Progress의 Variance도 Data Date 기준으로 수정

현재 Variance는 Matrix의 `asOfMode`에 영향을 받을 수 있습니다.

상단 Summary 카드에서는 별도의 Data Date 기준 누적값을 계산하겠습니다.

```ts
cumPlan = planned date <= dataDate
cumActual = actual date <= dataDate
variance = (cumActual - cumPlan) / cumPlan * 100
```

표시 문구도 Data Date 기준임이 명확하게 보이도록 유지/수정하겠습니다.

```text
{doneStages}/{totalStages} stages done · Up to Data Date · Var ...
```

## 유지되는 동작

- Matrix 내부 `Up to Data Date / Up to Today` 토글 기능은 그대로 유지
- 단, 기본값만 `Data Date`로 변경
- Gantt Timeline, System 필터, Stage 필터, Bucket 필터 동작은 변경하지 않음
- `Critical (≤7d)`와 `Upcoming 7d Plan` 카드는 기존 Today 기준 로직 유지

## 수정 파일

```text
src/pages/SchedulePage.tsx
```

## 검증 항목

- 페이지 진입 시 As-of 토글 기본값이 `Data Date`인지 확인
- Matrix 누적 컬럼 제목이 기본적으로 `Up to Data Date`인지 확인
- 사용자가 As-of를 `Today`로 바꾸면 Matrix는 Today 기준으로 변경되는지 확인
- 상단 Summary의 `Delay Up to Data Date` 카드는 토글과 무관하게 Data Date 기준으로 유지되는지 확인
- `Cumulative Progress`가 Data Date 이후 Actual 완료분을 포함하지 않는지 확인
- Delay 카드 클릭 후 Subtest List 결과가 Data Date 기준 지연 항목과 일치하는지 확인
