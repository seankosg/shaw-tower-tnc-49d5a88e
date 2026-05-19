## S-Curve ↔ Plan Mode 토글 연동 플랜

### 목표
Dashboard의 Plan vs Actual S-Curve 차트를 기존 Baseline/Remaining 토글에 연동하여, Remaining 모드에서는 "미완료 plan만 누적"한 곡선을 표시.

### 동작 규격

- **Baseline 모드 (기존 유지)**
  - T1/T2 Planned 누적 = 모든 subtest의 planned_date를 시간순으로 누적
  - T1/T2 Actual 누적 = 모든 actual_date를 시간순으로 누적
  - 곡선/스택바 동작 모두 현재와 동일

- **Remaining 모드 (신규)**
  - **Planned 누적 분자에서 제외**: 해당 bucket 시점 이전(또는 같은 시점)에 이미 actual이 완료된 subtest의 plan은 카운트하지 않음
  - 즉, 각 stage `s`에 대해 bucket `b`에서 plan을 1 카운트하는 조건:
    `planned_date(s, b) && !isStageActualUpTo(item, s, b)`
  - Actual 누적은 변경 없음 (실적은 사실이므로)
  - 결과적으로 plan 곡선이 "앞으로 남아있는 작업량" 형태로 평탄/하향 변형됨

### 시각화 영향

- Planned line: Remaining에서 완료분 제거되어 더 낮게 그려짐
- Actual line: 변동 없음
- 스택 바 segments (`t1Met`, `t1Shortfall`, `t1Excess`, `t1FuturePlan`):
  - `Met = min(plan, actual)` 정의 그대로 사용 (Remaining에서는 plan에 완료분이 빠지므로 자연스럽게 Excess 쪽으로 흡수)
  - `FuturePlan`(미래 bucket의 plan)은 Remaining에서도 그대로 표시 (미래 plan은 아직 완료될 수 없음 → 차이 없음)
- 차트 헤더에 현재 모드 라벨 표기 (`Planned (baseline)` / `Planned (remaining)`)

### 변경 파일

1. **`src/lib/dashboard-utils.ts`** (S-Curve 빌더 위치)
   - `buildSCurve` 시그니처에 `planMode?: 'baseline' | 'remaining'` 추가 (기본 `baseline`)
   - plan 카운팅 루프에서 Remaining일 때 `getStageActualDate(item, stage)`가 존재하고 `<= bucket`이면 plan 카운트를 skip
   - 구현: 각 subtest의 stage별 `actualDate`를 먼저 계산해두고, plan bucketize 단계에서 `(actualDate && actualDate <= planBucket)`이면 카운트에서 제외

2. **`src/pages/DefectDashboardPage.tsx`**
   - 기존 `usePlanMode()` 값을 `buildSCurve` 호출에 전달
   - 차트 카드 헤더의 legend/타이틀에 mode 라벨 반영

3. **`src/lib/dashboard-excel-export.ts`** (S-Curve export 사용 시)
   - S-Curve sheet 헤더에 현재 planMode 표기

4. **테스트 (`src/test/dashboard-utils.test.ts`)**
   - 기존 baseline 케이스는 그대로 통과해야 함
   - Remaining 신규 케이스: 동일 데이터에서 완료된 stage가 plan 곡선에서 제외되는지 검증

### Progress 페이지와의 정합성

- Progress 페이지 KPI(Cumulative Plan, Upcoming 7 Days)는 이미 Remaining 로직(`!isStageActualUpTo`) 적용됨
- S-Curve 동일 로직 사용 → 두 페이지가 같은 "Remaining 정의"로 일관 동작

### 영향 없는 영역 (계속 baseline 고정)

Top Overdue, Critical Watchlist, AlertBanner, Pie chart, KPI Card, diffMetrics — 의도적으로 유지.

### 기술 메모

- `buildSCurve` 내부에서 현재는 plan/actual을 각각 단순 bucket count만 함. Remaining을 위해서는 plan 카운팅 시 해당 subtest의 actual date 참조가 필요하므로, `for (const s of subs)` 루프에서 stage별 plan/actual 쌍을 함께 다룸:
  ```ts
  if (t1Plan) {
    const skip = planMode === 'remaining' && t1Actual && t1Actual <= t1Plan;
    if (!skip) ensure(bucketize(t1Plan, granularity)).t1p++;
  }
  ```
  - 비교 기준은 "bucket 시점"이 아니라 "plan 날짜 자체"로 단순화 가능 (actual ≤ plan이면 그 plan은 이미 처리된 작업이므로 제외). 이렇게 하면 plan bucket 위치와 무관하게 일관됨.
- 대안 비교 기준은 `actual <= bucket-end`이지만, 단순화 버전이 Progress 페이지의 `isStageActualUpTo(item, s, asOfDate)`와 의미적으로 가장 잘 맞음 (asOfDate 대신 plan 자체를 기준 시점으로 사용).
