## 배경

T&C 대시보드의 Data Date Delay를 "당일 plan AND not Done"으로 수정한 것과 동일한 버그가 **Defect Management** 대시보드에도 존재합니다.

`src/lib/defect-dashboard-utils.ts` line 146:
```ts
if (isStageDelayedAsOf(item, stage, dataDate)) dataDateDelay++;
// = planned_date <= dataDate AND !done  (누적)
```

→ Data Date Delay가 누적이라 Δ 음수의 절댓값과 일치하지 않음. 같은 BMS-039/040 시나리오를 적용하면 동일 문제 발생.

또한 클릭 핸들러는 `overdue=true & asOf=dataDate`로 이동하는데, 이 필터는 누적 overdue (planned ≤ asOf AND not done)를 적용해 "당일 plan만"이 아니라 과거 누적 지연 항목까지 모두 보여주므로 화면 카운트와 목록이 불일치합니다.

## 변경 내용

### 1. 집계 로직 (`src/lib/defect-dashboard-utils.ts`)

`calcMetrics` 함수의 `dataDateDelay` 계산 변경:
```text
변경 전: isStageDelayedAsOf(item, stage, dataDate)
변경 후: plan === dataDate && !isStageDone(item, stage)
```

`diffMetrics`의 `dataDateDelay` (= `max(0, c.dataDateDelay - z.dataDateDelay)`)는 그대로 유지 — 새 정의에서도 의미 보존됨 (당일 completion plan 미완료 - 당일 closure plan 미완료).

### 2. URL 필터 추가 (`src/pages/DefectRawDataPage.tsx`)

새 쿼리 파라미터 `dueOn`을 도입 (값: ISO 날짜). 동작: "해당 stage의 planned_date == dueOn AND 해당 stage 미완료" 필터. 기존 `stage` 파라미터를 함께 사용해 stage 결정 (completion / closure / start / 없으면 closure 미완료 + 어느 stage든 plan==date AND not done).

`overdue` 필터 처리 블록 다음에 추가:
```ts
const dueOn = searchParams.get('dueOn');
if (dueOn) {
  const stage = searchParams.get('stage');
  next = next.filter((item) => {
    if (Boolean(item.actual_closure_date)) return false;
    if (stage === 'start') return item.planned_start_date === dueOn && !item.actual_start_date;
    if (stage === 'completion') return item.planned_completion_date === dueOn && Number(item.actual_progress_pct ?? 0) < 100;
    if (stage === 'closure') return item.planned_closure_date === dueOn && !item.actual_closure_date;
    // fallback: any stage planned exactly on the date and not yet done
    return (
      (item.planned_start_date === dueOn && !item.actual_start_date) ||
      (item.planned_completion_date === dueOn && Number(item.actual_progress_pct ?? 0) < 100) ||
      (item.planned_closure_date === dueOn && !item.actual_closure_date)
    );
  });
}
```

활성 필터 칩(active filter chips) 표시도 `dueOn`에 대해 추가:
```ts
const dueOn = searchParams.get('dueOn');
if (dueOn) {
  const stage = searchParams.get('stage');
  const stageLabel = stage === 'completion' ? 'Completion' : stage === 'closure' ? 'Closure' : stage === 'start' ? 'Start' : 'Stage';
  out.push({ label: `${stageLabel} due ${dueOn} (open)`, param: 'dueOn', clears: ['dueOn', 'stage'] });
}
```

### 3. Defect Dashboard 클릭 핸들러 (`src/pages/DefectDashboardPage.tsx`)

Data Date Delay 셀 (line 518) 변경:
```text
변경 전: go(row.key, { overdue: 'true', asOf: dataDate })
변경 후: go(row.key, { dueOn: dataDate, stage: stage.stage })
       (단, isDifference=true인 경우 rowClick fallback 유지)
```

Today Delay 셀 (line 532)도 동일한 정의 일관성을 위해 변경:
```text
변경 전: go(row.key, { overdue: 'true', asOf: today })
변경 후: go(row.key, { dueOn: today, stage: stage.stage })
       (isDifference=true이면 rowClick)
```

→ 표에 보이는 카운트(당일 plan AND not done)와 클릭 후 목록이 정확히 일치.

### 4. 테스트 추가 (`src/test/defect-dashboard-utils.test.ts`)

기존 테스트 파일이 있는지 확인 후, 없으면 신규 생성. 다음 케이스 검증:
- 사용자 시나리오 미러링: completion plan 04-24 (open) + completion plan 04-25 (open), dataDate=04-25
  - `completion.dataDatePlan === 1`, `completion.dataDateActual === 0`, `completion.dataDateDelay === 1`
  - `|Δ| === dataDateDelay` 보장
- closure stage에 대해서도 동일 패턴 검증

기존 defect 관련 테스트와 함께 `bunx vitest run`으로 회귀 확인.

### 5. 영향 범위 / 비변경 사항

- `aggregateDefectPlanActualByGroup`의 정렬 키, 헤더 합계 등은 자동 반영.
- `KpiCard` "Overdue - Completion/Closure/Start" 카드(누적 overdue가 정확한 의미)는 변경하지 않음.
- "Top 10 Overdue Defects", `AlertBanner`(누적 overdue) 등도 변경하지 않음.
- `defect-dashboard-excel-export.ts`의 컬럼 매핑은 그대로 (값만 새 정의로 채워짐).
- `isStageDelayedAsOf` export는 다른 코드에서 사용되므로 유지.

## 영향 받는 파일

- `src/lib/defect-dashboard-utils.ts` — `dataDateDelay` 계산식 변경
- `src/pages/DefectRawDataPage.tsx` — `dueOn` 필터 + active chip 처리 추가
- `src/pages/DefectDashboardPage.tsx` — Data Date Delay & Today Delay 클릭 핸들러를 `dueOn` 필터로 교체
- `src/test/defect-dashboard-utils.test.ts` — 신규/추가 테스트 케이스

## 검증

- `bunx vitest run` 전체 테스트 통과
- Defect Dashboard에서 Data Date Δ < 0인 행에서 `Delay == |Δ|` 성립
- Data Date Delay 셀 클릭 시, 보이는 카운트와 동일한 수의 항목이 DefectRawData 목록에 표시
- Today Delay 셀도 동일하게 검증
