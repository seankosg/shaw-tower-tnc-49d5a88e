## 배경

T&C 대시보드 "계획 및 실적" 표의 Data Date 섹션에는 **Plan / Actual / Δ / Delay** 4개 컬럼이 있습니다.

현재 동작:
- **Plan / Actual / Δ**: 당일 단위 (`planned_date == dataDate`, `actual_date == dataDate`, 둘의 차이)
- **Delay**: **누적** 지연 (`planned_date <= dataDate AND not Done`)

문제: Δ가 음수일 때 그 절댓값과 Delay 값이 일치하지 않고, "당일" 컬럼인데도 과거 누적 지연이 합쳐져 표시됩니다.

예시 (사용자 제공):
- BMS-039-MST-070: T2 예정일 = 2026-04-24 (미완료)
- BMS-040-MST-070: T2 예정일 = 2026-04-25 (미완료)
- Data Date = 2026-04-25

→ 기대 동작: Data Date Delay에는 **04-25 plan인 BMS-040만** 카운트 (BMS-039 제외).
→ 현재 동작: 둘 다 카운트 (누적이므로).

## 변경 내용

### 1. 집계 로직 (`src/lib/dashboard-utils.ts`)

`aggregatePlanActualByGroup`의 `dataDateDelay` 계산 변경:

```text
변경 전: isStageDelayedAsOf(i, stage, dataDate)
         → planned_date <= dataDate AND !done  (누적)

변경 후: isStagePlannedOn(i, stage, dataDate) && !isStageDone(i, stage)
         → planned_date == dataDate AND !done  (당일)
```

`yesterdayDelay`(deprecated alias)도 같은 새 값을 가리키도록 유지.

### 2. 본문 셀 클릭 핸들러 (`src/pages/DashboardPage.tsx`)

Data Date Delay 셀의 클릭 파라미터를 `delayAsOf`(누적 의미)에서 `delayOn`(당일 의미)으로 교체:

```text
변경 전: go(r.key, { [st.delayAsOf!]: dataDate })  // 예: t2_delay_asof=2026-04-25
변경 후: go(r.key, { [st.delayOn!]:   dataDate })  // 예: t2_delay_on=2026-04-25
```

→ 클릭 시 SubtestList가 "해당 일자에 plan이고 아직 Done 아님" 필터를 적용해, 화면에 보이는 카운트와 이동 후 목록이 정확히 일치하게 됨.

Cumulative 섹션의 Δ(누적) 음수 클릭 핸들러는 기존 `delayAsOf` 그대로 유지(누적 지연 의미가 맞음).

헤더 합계 셀(`headerTotals.dataDateDelay`)은 코드 변경 없음 — 집계 결과만 바뀌므로 자동 반영.

### 3. 테스트 업데이트 (`src/test/dashboard-utils.test.ts`)

기존 두 케이스의 기대값을 새 정의에 맞춰 수정:
- "counts Today Delay only for items planned today and not done": `t1.dataDateDelay` 기대값 `1` → `0`
- "keeps Today Delay at zero when Today Plan is zero": `t1.dataDateDelay` 기대값 `2` → `0`

사용자 시나리오를 그대로 반영하는 신규 케이스 추가:
- T2 plan 2026-04-24 (open) + T2 plan 2026-04-25 (open), dataDate = 2026-04-25
- 기대: `t2.dataDatePlan === 1`, `t2.dataDateActual === 0`, `t2.dataDateDelay === 1`
- 즉, Delay 값이 `|Δ|` 와 일치하고, dataDate 이전 plan(04-24)은 카운트되지 않음.

### 4. 적용 범위

사용자가 명시한 **T&C(Schedule) 대시보드만** 변경합니다. `Defect Dashboard`(`src/pages/DefectDashboardPage.tsx`, `src/lib/defect-dashboard-utils.ts`)와 관련 엑셀 export는 기존 누적 정의를 유지합니다.

## 영향 받는 파일

- `src/lib/dashboard-utils.ts` — `dataDateDelay` 계산식 변경
- `src/pages/DashboardPage.tsx` — Data Date Delay 셀 클릭 파라미터 `delayAsOf` → `delayOn`
- `src/test/dashboard-utils.test.ts` — 기대값 수정 + 신규 케이스 추가

## 검증

- `bunx vitest run`으로 전체 테스트 통과 확인
- 사용자 예시(BMS-039 / BMS-040)를 가진 데이터에서 Data Date(2026-04-25) Delay 값이 1로 표시되고, 클릭 시 BMS-040만 보이는지 확인
- Data Date Δ가 음수인 모든 행에서 `Delay == |Δ|`가 성립하는지 확인
