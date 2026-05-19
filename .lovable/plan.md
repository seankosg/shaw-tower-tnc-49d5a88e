# T&C 모듈에 Baseline/Remaining 토글 이식 계획

Defect 모듈에서 완성된 Plan Mode 토글(Baseline ↔ Remaining)과 부수 변경 일체를 T&C 모듈(`SchedulePage`, `DashboardPage`)에 동일한 사양으로 이식합니다. 공용 hook `usePlanMode`는 이미 존재하므로 재사용합니다.

---

## 1. 공용 Hook 재사용 (신규 파일 없음)

- `src/hooks/usePlanMode.ts`는 Defect/T&C 양쪽에서 그대로 사용.
- 단, localStorage 키와 이벤트 이름이 `defect:planMode` / `defect-planmode-change`로 Defect 전용처럼 보이므로 그대로 두되, **T&C 페이지도 동일 키를 공유**시켜 한 프로젝트 내 단일 진실 소스로 운영(요구사항: Defect와 동일 동작). 추가 작업 없음.
- 기본값은 기존과 동일하게 `remaining`.

---

## 2. 집계 로직 변경 — `src/lib/schedule-utils.ts`

`aggregateSchedule()` 에 Defect와 동일한 Remaining 모드 추가.

- 타입 추가: `export type TcPlanMode = 'baseline' | 'remaining';`
- `AggregateOptions`에 `planMode?: TcPlanMode` 추가 (기본 `baseline`).
- 내부 루프에서 각 stage의 plan 카운트를 다음 조건으로 게이팅:
  ```ts
  const stageDoneAsOf = isStageActualUpTo(s, st, opts.asOfDate);
  const countPlan = !!plan && (planMode === 'baseline' || !stageDoneAsOf);
  if (countPlan) { cells.plan++; totalPlan++; if (isStagePlannedUpTo) cumPlan++; }
  ```
- Actual / totalDone / cumActual 로직은 변경 없음.
- 정렬 변경: 기존 `cumActual/cumPlan` 비율 정렬 → **Group label 알파벳 오름차순**으로 변경 (Defect와 일관).

---

## 3. 집계 로직 변경 — `src/lib/dashboard-utils.ts`

`aggregatePlanActualByGroup()` 및 `buildSCurve()`에 Plan Mode 적용.

### 3-1. `aggregatePlanActualByGroup`
- 시그니처에 `planMode: TcPlanMode = 'baseline'` 추가 (마지막 인자).
- `calc(stage)` 내부에서:
  - `cumPlan++`, `dataDatePlan++`, `dataDateDelay++`, `tPlan++`, `tDelay++` 등 **plan 측 5종 카운트** 모두 `(planMode === 'baseline' || !isStageActualUpTo(i, stage, dataDate))` 조건으로 게이팅.
  - `todayPlan`은 `today` 기준으로 `isStageActualUpTo(i, stage, today)` 사용.
- 정렬도 label 알파벳 오름차순으로 변경(Defect 일관).

### 3-2. `buildSCurve`
- 시그니처에 `planMode: TcPlanMode = 'baseline'`, `asOfDate: string` 추가.
- Remaining 모드일 때, 각 subtest의 t1Plan/t2Plan 누적 시 해당 stage가 `asOfDate` 시점에 이미 done이면 plan 기여를 제거(`!isStageActualUpTo(s, stage, asOfDate)` 게이팅). cT1p/cT2p 사전 누적과 버킷 누적 양쪽 모두 동일 규칙.
- Actual / Met / Shortfall / Excess / FuturePlan 로직은 유지.

### 3-3. KPI 보조함수 (선택)
- `countOverdueStageOccurrences`, `isOverdue`, `isAtRisk` 등은 **변경하지 않음**. 이는 Defect와 동일하게 항상 Baseline 의미(예정일 기준 지연)를 유지.

---

## 4. UI — `src/pages/DashboardPage.tsx`

- `usePlanMode()` import 및 사용: `const [planMode, setPlanMode] = usePlanMode();`
- URL 동기화: `searchParams`에 `plan_mode` 키 추가/삭제 (기본 `remaining` → 생략, `baseline`만 기록).
- `bySystem/bySubcon/bySubsub/byHdec/byTeam` 호출 시 마지막 인자로 `planMode` 전달.
- `scurve` 계산 시 `buildSCurve(filteredSubtests, scurveBucket, scurveStart, scurveEnd, today, planMode, dataDate)` 로 호출.
- **토글 UI 위치**: "Plan vs Actual - Summary" Card 헤더 우측에 `ToggleGroup`(single, sm) — Defect Dashboard와 동일 레이아웃. 라벨에 동적 `(remaining)`/`(baseline)` 문구 표시.
- KPI 카드(Top KPIs, Pred/T1/T2/R1/R2 stage 카드), Pie 차트, Top Overdue, Critical Items, Alert Banner — **변경 없음** (Defect와 동일하게 baseline 고정).
- Excel export(`exportPlanActualToExcel`, `exportTncSCurveToExcel`) 호출부에 `planMode` 전달하여 헤더 메타에 반영(아래 §6).

---

## 5. UI — `src/pages/SchedulePage.tsx`

- `usePlanMode()` import 및 사용.
- URL 동기화: `plan_mode` 키 추가.
- `aggregateSchedule(...)` 호출 시 `planMode` 옵션 전달.
- **KPI 블록 재계산**: 페이지 상단 `kpis` useMemo 내 `cumPlan++` 및 `upcoming7Plan++` 누적을 Remaining 모드에서 stage-done as-of-data-date인 경우 제외하도록 동일 규칙 게이팅. `overdue`는 그대로(baseline).
- **토글 UI 위치**: Defect Progress와 동일 — 상단 툴바가 아니라 **테이블 바로 위 Action row**의 좌측에 배치. `Show past`/`Show Risk Panel` 토글은 우측 유지. row는 `justify-between`.
  - `ToggleGroup` single, size sm, `h-8 px-2 text-xs`, 옆에 작은 설명 텍스트(`Plan counting: …`).
- **테이블 정렬**: `aggregateSchedule` 정렬 변경(§2)에 따라 자동으로 알파벳 오름차순으로 표시됨.
- Critical Watchlist, Lagging Groups — **변경 없음** (baseline).
- Schedule Excel export 호출부에 `planMode` 전달(아래 §6).

---

## 6. Excel Export — 메타 행에 Plan Mode 표기

다음 export 함수의 메타/헤더 영역에 현재 `planMode` 값 한 줄 추가(예: `Plan Mode: Remaining (excludes completed)` 또는 `Baseline`).

- `src/lib/schedule-excel-export.ts` — `exportScheduleToExcel(data, opts)` 의 `opts`에 `planMode` 추가, 메타 행에 출력.
- `src/lib/dashboard-excel-export.ts` — `exportPlanActualToExcel(...)`에 `planMode` 인자 추가, 메타 행에 출력.
- `src/lib/scurve-excel-export.ts` — `exportTncSCurveToExcel({...})`의 옵션에 `planMode` 추가, 메타에 출력. (S-Curve 자체 plan 수치도 §3-2 변경으로 모드 반영됨)

데이터 셀 자체 수치는 §2, §3 변경의 결과이므로 export 내부 산식 수정은 불필요.

---

## 7. 회귀 방지 — 테스트

- `src/test/dashboard-utils.test.ts`에 다음 케이스 추가:
  - 이미 Actual 완료된 stage의 plan이 Baseline에서는 cumPlan에 포함, Remaining에서는 제외됨을 확인.
  - 동일 케이스를 `buildSCurve`에 대해 검증(t1Planned 누적 차이).
- 신규 `src/test/schedule-utils.test.ts` (없으면 생성) 또는 기존 인접 테스트에 `aggregateSchedule` planMode 분기 케이스 1~2개 추가.

---

## 8. 작업 외 (의도적으로 제외)

- Top Overdue, Critical Watchlist, Alert Banner, Pie 차트, KPI Stage 카드의 done/overdue 수치 — 항상 baseline 유지(Defect와 일관).
- `usePlanMode` 키/이벤트 이름 리네임 — Defect와 단일 동기화 필요 → 변경 안 함.
- `stage-metrics.ts` — 변경 없음(헬퍼 그대로 재사용).

---

## 기술적 세부

- 변경 파일 목록(요약):
  - `src/lib/schedule-utils.ts` (타입 + 집계 + 정렬)
  - `src/lib/dashboard-utils.ts` (`aggregatePlanActualByGroup`, `buildSCurve`)
  - `src/pages/SchedulePage.tsx` (hook, URL, 호출, 토글 UI 위치, KPI 게이팅)
  - `src/pages/DashboardPage.tsx` (hook, URL, 호출, 토글 UI)
  - `src/lib/schedule-excel-export.ts`, `src/lib/dashboard-excel-export.ts`, `src/lib/scurve-excel-export.ts` (메타)
  - 테스트 파일 1~2개

- `usePlanMode`는 그대로 공용. 사이드이펙트로 Defect 페이지에서 토글을 바꾸면 T&C 페이지도 동일 모드로 반영됨(요구사항: "그대로 적용" 해석상 OK). 만약 모듈별 독립을 원할 경우 hook 분리 옵션은 후속 작업으로 대응.
