## 목적

Defect Raw Data의 계획(Planned)/실적(Actual) 일자를 바탕으로 임의의 미래(또는 과거) 날짜 D를 입력했을 때, 각 단계(Start / Completion / Closure)의 **수량 기준 누계 진도율(%)** 을 예측하는 "Simulation" 탭을 신규 생성합니다. 본 계획은 **Defect만** 다룹니다 (T&C는 후속 단계).

## 예측 로직 (단계별, 수량 기준)

대상 모집단: `defect_items` 중 `is_active = true`, 팀 필터 적용 후의 N개 항목.

각 단계 stage ∈ {start, completion, closure} 와 시뮬레이션 대상일 D 에 대해:

```text
done_actual(D)   = count( actual_<stage>_date IS NOT NULL AND actual_<stage>_date <= D )
forecast_planned(D) = count( actual_<stage>_date IS NULL  AND planned_<stage>_date IS NOT NULL AND planned_<stage>_date <= D )
predicted(D)     = done_actual(D) + forecast_planned(D)
predicted_pct(D) = predicted(D) / N * 100
```

비교용 보조 지표:
- `actual_pct(D)` = 실적만 (done_actual / N) — 과거 D에서는 실측, 미래 D에서는 "이미 끝난 것"
- `plan_pct(D)` = (실적 무관) planned ≤ D 인 모든 항목 / N — 원래 계획상 진도
- `gap(D)` = predicted_pct − plan_pct (계획 대비 예상 초과/지연)

`planned_<stage>_date`도 없는 항목은 해당 단계에서 영원히 미완료로 간주(분모엔 포함, 분자엔 제외) → 100%에 도달하지 않을 수 있음을 UI에서 명시.

## UI 구성

### 1. 진입
- 새 사이드바 항목: **Defects → Simulation** (`/defects/simulation`)
- `DefectProgressPage` 상단에 보조 링크 버튼도 추가

### 2. 컨트롤
- **Target Date** 단일 날짜 picker (기본 = data date + 30일)
- **Team 필터** (Progress 페이지와 동일한 셀렉트 재사용)
- **Stage 다중 선택** (기본: 3개 모두)
- **Range** (차트 X축 범위) — 기본: data date − 14일 ~ data date + 90일

### 3. 핵심 위젯

**A. Stage 요약 카드 (3개)**  
각 단계별로:
- 큰 숫자: `predicted_pct(target)` %
- 보조: `actual_pct(today)` 현재 실적, `plan_pct(target)` 계획, gap
- 잔여 항목 수, "no planned date" 항목 수 경고

**B. 누적 진도 라인 차트 (recharts)**  
X = range 내 일자, Y = % (0–100), 라인 3종 × stage:
- Plan (계획만) — 점선
- Actual (현재까지 실적) — data date에서 멈춤
- Predicted (실적 + 미래 계획) — 미래 구간만 표시

target date에 vertical reference line.

**C. 상세 테이블**  
행: stage, 열: `Done now`, `Plan @target`, `Predicted @target`, `Gap`, `Remaining`, `No-plan`.  
셀 클릭 시 `defects/raw-data`로 해당 필터 적용 이동(progress 페이지의 `goRaw` 패턴 재사용).

**D. (옵션) 팀별 분해 테이블** — 팀 × stage `predicted_pct(target)` 매트릭스, 색상 히트맵.

### 4. Export
Excel 1장: 요약 + 일별 시계열(Plan/Actual/Predicted, stage별 컬럼) + 팀 분해.

## 기술 설계

```text
src/lib/defect-simulation.ts        (pure)
  - buildDefectStageSeries(items, range, asOfDate) -> { dates, perStage: { plan[], actual[], predicted[] } }
  - simulateDefectStageAt(items, stage, targetDate, asOfDate) -> { done, forecast, predicted, planOnly, total, noPlan }
  - simulateAllStages(items, targetDate, asOfDate)
  - groupByTeam(items, targetDate, asOfDate) -> rows

src/pages/DefectSimulationPage.tsx  (route component)
src/components/defects/DefectSimulationChart.tsx
src/components/defects/DefectSimulationSummaryCards.tsx
src/components/defects/DefectSimulationDetailTable.tsx
src/lib/defect-simulation-excel-export.ts
src/test/defect-simulation.test.ts
```

기존 자산 재사용:
- `useLatestDataDate`, `addDays`, `DefectItem` 타입
- `getDefectStagePlannedDate / getDefectStageActualDate` (stage별 일자 추출)
- Progress 페이지의 팀 필터 / 데이터 fetch (페이징 1000) 패턴 그대로

라우팅: `App.tsx`에 `<Route path="/defects/simulation" element={<DefectSimulationPage />} />`, 사이드바 `Defects` 그룹에 항목 추가.

## 범위 외 (이번 단계 X)
- T&C(서브테스트) 시뮬레이션 — 동일 패턴으로 다음 단계에서 추가 예정 (`subtest`의 t1/t2/r1/r2s/r2a 5단계 적용)
- 시뮬레이션 결과 DB 저장 / 스냅샷
- 학습 기반(과거 지연율 가중) 예측 — 1차는 "실적 + 계획" 단순 합산만

## 산출 결과 사용자 시나리오
1. 사용자: Defects → Simulation 진입, Target Date `2026-08-31` 선택
2. 화면: Completion 78.4% / Closure 65.2% 등 카드 표시, 차트로 추세 확인
3. 카드의 "Remaining" 클릭 → Raw Data 페이지로 해당 단계 미완료 항목 필터된 상태로 이동