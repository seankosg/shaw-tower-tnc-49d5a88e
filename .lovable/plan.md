# Snapshot Dates 무반응 문제 — 진단 및 수정 계획

## 배경

- 영향 받는 슬라이드: **#5 T&C Forecast**, **#9 Defect Forecast** (둘 다 `addChart('bar')` 클러스터 컬럼 차트)
- 코드 경로: `ReportTab.snapshotDates` → `buildReport({ snapshotDates })` → `report-builder` 가 각 날짜별 `simulateAllTncStages / simulateAllDefectStages` 호출 → `tnc.snapshots[] / defect.snapshots[]` 생성 → `ppt-builder.loadKPIs` → `buildForecast / buildDefectForecast` 의 `snaps.map(sn => sn.t1.planPct ...)` 가 막대 데이터로 사용

설계상 Snapshot Dates 를 추가하면 막대 그룹 수와 높이가 모두 바뀌어야 합니다. 그런데 시각적으로 동일하다면 다음 셋 중 하나입니다.

## 의심 원인 후보 (우선순위 순)

1. **데이터는 바뀌지만 시각적으로 동일하게 보이는 경우 — 가장 유력**
   - 현재 `simulateTncStageAt.planPct = planOnly/total × 100` 이며 `planOnly` 는 "원래 planned date ≤ targetDate" 인 항목 수. **단조 증가**.
   - 기본 3개 날짜(`2026-05-30 / 06-07 / 06-14`)는 MC(`2026-06-15`)에 매우 가까워, 모든 항목의 planned date 가 이미 첫 날짜 이전이면 세 막대가 전부 100%로 동일.
   - 사용자가 추가한 날짜(예 `06-30`, `07-15`)도 100%에서 더 오를 수 없어 **막대 그룹 수만 늘고 높이는 동일** → "그래프가 안 바뀐다"로 보임.
   - Defect 도 동일하게 단조 증가.

2. **labels 가 series 마다 동일해야 하는 pptxgen 'bar' 차트의 동작 차이**
   - `chartData = [{name, labels: milestones, values}, ...]` 3개 series 모두 같은 `milestones` 를 넘김. 정상이지만 pptxgen 일부 버전에서 카테고리 축이 series[0].labels 만 사용. 큰 영향은 아님.

3. **클로저/메모이제이션로 인한 stale state** — 코드 리뷰 결과 `PptExportCard.handleConfirmDownload` 가 매번 `getReportData()` 신규 호출, `ReportTab` 의 `getReportData` 클로저도 매 렌더마다 최신 state 캡처. **이쪽은 문제 없음.**

## 진단 단계 (build mode 전환 후 수행)

1. 임시 로그 삽입: `report-builder.ts` 의 tnc/defect snapshots 계산부에 `console.table` 로 `{date, t1.planPct, t2.planPct, r2s.planPct}` (defect 도 동일) 출력.
2. 브라우저에서 기본 3개 + 새 날짜 추가 → "Create PPT" 후 콘솔 확인.
   - 모두 100% 또는 동일 값 → 원인 #1 확정.
   - 값은 다른데 PPT 가 같다 → 원인 #2/#3 추가 조사.
3. 확정 후 로그 제거.

## 수정안 (원인 #1 가정 — 가장 유력)

`planPct` 가 가까운 날짜에서 거의 동일해 시각적 변별력이 없는 게 본질입니다. 두 가지를 동시 적용합니다.

### A. Forecast 차트에 "Actual / Predicted" 도 함께 표시

- 지금은 milestone × stage 의 **planPct 단일 값**만 막대. 사용자가 임의 날짜를 추가해도 보조 정보가 없어 의미가 약함.
- `snaps[i].t1.actualPct` 와 `snaps[i].t1.predictedPct`(시뮬레이션 예측)는 이미 계산되어 있음 (`toSimSnap` 결과).
- 변경:
  - **T&C Forecast (slide 5)**: 기존 3개 series(Plan only) → `Pre-Test Plan / Pre-Test Predicted`, `Official Plan / Official Predicted`, `Test Report Plan / Test Report Predicted` 의 6 series. Predicted 는 같은 색상의 반투명 채움 또는 패턴으로 구분.
  - **Defect Forecast (slide 9)**: 동일 패턴 — Completion Plan/Predicted, Closure Plan/Predicted.
- 결과: 같은 날짜에서도 Plan(100%) 과 Predicted(예: 87%) 가 갈라져 표시되며, 새 날짜 추가 시 Predicted 가 올라가는 추이가 보임 → "변하지 않는다" 해소.

### B. Snapshot Dates 입력 가드 + 안내 문구

- `ReportTab` 의 Snapshot Dates 옆에 "데이터 날짜 이전 또는 MC 직후 날짜는 plan%가 포화되어 막대 높이가 같게 보일 수 있음" 안내 캡션 추가.
- `addDate` 에서 중복뿐 아니라 `dataDate` 이전, MC 이후 30일 초과 날짜는 시각적 경고 톤스트.

## 추가 (원인 #2 보강) — 라벨 동기화 보장

각 series 에 동일한 `milestones` 배열이 들어가 있음을 명시적으로 보장하기 위해 `chartData` 빌드 시 `Object.freeze(milestones)` 로 공유 참조 사용, 그리고 빈 milestones (`opts.snapshotDates.length === 0`) 일 때 슬라이드에 `"No snapshot dates selected"` placeholder 텍스트 표시(현재는 빈 차트).

## 변경 파일 (예정)

- `src/lib/ppt-builder.ts` — `buildForecast`, `buildDefectForecast` 의 `chartData` 구성을 Plan/Predicted 6/4 series 로 확장, 빈 milestones 가드, 색상 매핑.
- `src/pages/admin/ReportTab.tsx` — Snapshot Dates 입력 영역 안내 캡션.
- (진단용) `src/lib/report-builder.ts` — 임시 로그(확인 후 제거).

## 비변경

- DB / RLS / edge function — 변경 없음.
- Snapshot 슬라이드(3·8), S-Curve(4·9) — 사용자가 "5/9번"으로 한정했으므로 손대지 않음.
- Markdown / JSON 출력 포맷 — 그대로.

## 리스크 / 검증

- pptxgen bar 차트에서 6 series 클러스터링 시 막대가 얇아질 수 있음 → `barGapWidthPct` 를 `100`으로 낮추고 데이터 라벨 폰트 11pt 로 조정.
- 빌드 후 PPT 다운로드 → PowerPoint 에서 슬라이드 5/9 확인, Snapshot Dates 1개/3개/5개 케이스로 검증.
