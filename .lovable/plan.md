## 변경 사항

### 1. 삭제: 하단 Stage 요약 카드
Defect Dashboard의 `Completion` / `Closure` 큰 요약 카드 (Total / Done / Remaining + progress bar) 두 개를 삭제합니다. (`src/pages/DefectDashboardPage.tsx` 211–214 라인)

### 2. 추가: 최상단 KPI 카드에 진도율 bar
최상단 5개 KPI 카드 중 아래 3개의 하단에 얇은 progress bar를 추가합니다. **카드 높이는 변경하지 않고**, 기존 여백 안에 맞춰 배치합니다.

| 카드 | Bar 값 | Bar 색 |
|---|---|---|
| Completion Done | `completionPct` (Done/Total %) | 기본 (primary) |
| Open Defect | `100 − completionPct` (남은 비율) | 붉은색 (destructive) |
| Closure Done | `overallProgressPct` (Closure/Total %) | 기본 (primary) |

`Total Defects`, `Remain Inspection` 카드는 기존 그대로 유지합니다.

### 기술적 세부사항

- `KpiCard` 컴포넌트(line 267)에 선택적 prop 두 개를 추가:
  - `progress?: number` — 0–100
  - `progressTone?: 'default' | 'destructive'` — bar 색상
- `progress`가 주어지면 `<Progress />` (height `h-1.5`)를 `CardContent` 하단에 렌더링. `destructive` tone일 경우 `[&>div]:bg-destructive` 같은 indicator 색 override 적용.
- 카드 컨테이너 padding(`p-4`)과 내부 텍스트 크기를 그대로 유지하고, bar는 sub 텍스트 아래 `mt-1.5` 정도의 작은 간격으로 삽입 → 기존 카드 높이와 거의 동일하게 유지됨 (Open Defect는 sub 존재, Completion/Closure Done도 sub `% completed/closed` 존재 → 세 카드 모두 동일 높이).
- 사용처(line 193–195)에서 새 prop 전달:
  - 193: `progress={kpis.completionPct}`
  - 194: `progress={100 - kpis.completionPct} progressTone="destructive"`
  - 195: `progress={kpis.overallProgressPct}`
- 211–214 라인의 `<div className="grid gap-3 md:grid-cols-2"> ... StageCard ... </div>` 블록 제거.
- 더 이상 사용되지 않으면 `StageCard`, `MiniStat` 함수와 관련 import 정리.

### 영향 받는 파일
- `src/pages/DefectDashboardPage.tsx`
