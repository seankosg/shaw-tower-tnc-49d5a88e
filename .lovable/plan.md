## 요약
`ProductivityTable.tsx`의 Total 섹션 최상단에 **Plan 합계 / Actual 합계** 2개 행을 추가합니다. 기존 메트릭별 Total(T&C Planned, T&C Actual, Defect Planned, Defect Actual)은 그대로 유지하고, 그 위에 표시중인 모든 항목(workplace 필터에 포함된 T&C + Defect)을 가로지르는 grand total 2행을 둡니다.

## 변경 파일
- `src/components/analysis/ProductivityTable.tsx`

## 변경 내용

### 1) Grand Total 행 데이터 정의 (line 217~232 영역)
- 새로운 타입 `GrandRow = { key: 'plan'|'actual'; label: string; metrics: MetricRow[] }` 도입.
- `grandRows` 구성:
  - Plan: `totalMetrics` 중 key가 `tcp`, `dfp` 인 항목 (현재 토글된 workplace만 포함)
  - Actual: `totalMetrics` 중 key가 `tca`, `dfa` 인 항목
- 셀 값 계산:
  - Qty(날짜별/전체) = 해당 grand 그룹에 속한 모든 `MetricRow`의 `sumQty(mr, d)` 합
  - Man(날짜별/전체) = 중복 합산 방지를 위해 그룹의 **고유 workplace 집합** 기준으로 `sumMan(wp, d)` 합 (예: Plan 그룹에 T&C+Defect 모두 있으면 두 workplace Man 합)
  - Nos/Man = `prod(qSum, mSum)`
  - Average Qty/Man = `Math.floor(sum/denom)`

### 2) 렌더링 (line 287~328 영역)
- TableBody 상단에 `grandRows.map(...)` 블록을 먼저 렌더링.
  - 좌측 sticky 셀: `Total` 라벨을 `rowSpan = grandRows.length + totalMetrics.length` 로 병합 → 기존 per-metric Total의 rowSpan과 통합 (또는 grand 2행 + 메트릭 행으로 별도 rowSpan 사용 중 깔끔한 한 가지 채택; 시각적 일관성을 위해 단일 `Total` 셀로 병합 권장).
  - Metric 셀 라벨: `Plan (Total)`, `Actual (Total)` — 굵게 강조, `bg-muted` 더 진하게 (`bg-muted`).
  - 첫 번째 grand 행에 `border-t-2`, 마지막 per-metric Total 행에 기존 `border-b-2` 유지. 두 그룹 사이에는 `border-b` 분리선 추가.
- sticky `top` 오프셋 재계산:
  - `TOP_TOTAL_BASE = H_HEAD * 2` 시작
  - grand 행 i: `top = TOP_TOTAL_BASE + H_HEAD * i`
  - per-metric Total 행 j: `top = TOP_TOTAL_BASE + H_HEAD * (grandRows.length + j)`
- 좌측 `Total` 병합 셀의 `rowSpan`을 새 총행 수(grand + per-metric)로 설정.

### 3) 필터 동작
- `rowSubs` (Subcontractor/Team 필터 반영)와 `fWp` (Workplace 토글)는 기존 로직 그대로 사용 → 필터 = All이면 모든 항목 합산이 자동 성립.
- Workplace 토글에서 T&C만 켠 경우 Plan/Actual grand 행은 T&C 단일 메트릭만 합산. Defect만 켠 경우도 동일.

## 검증
- DMR Dashboard에서 필터 All 상태에서 Plan 행 Qty = T&C Planned + Defect Planned 동일 날짜 합과 일치.
- Workplace 필터에서 T&C만 켰을 때 Plan 행이 T&C Planned 값과 정확히 같아야 함.
- 세로 스크롤 시 헤더 2행 + Plan/Actual grand 2행 + per-metric Total 4행이 모두 sticky 유지.
- 좌측 `Total` 라벨 셀이 모든 Total 행에 걸쳐 세로 병합되어 표시됨.