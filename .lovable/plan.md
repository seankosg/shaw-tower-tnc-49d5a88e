## 문제

ProductivityTable 및 DMR Breakdown 테이블의 sticky Total 행이 `bg-muted/70` (70% 투명)으로 되어 있어, 데이터 행이 그 아래로 스크롤될 때 뒷면 글자가 비쳐 보입니다. 화면상 "Defect Planned" 행이 두 줄로 겹쳐 보이는 원인입니다.

## 수정 범위

투명도만 제거합니다. 레이아웃, 폰트, 동작은 그대로.

### 1) `src/components/analysis/ProductivityTable.tsx`

- Per-metric Total 행에서 `bg-muted/70` → `bg-muted` 로 전부 교체
  - `<TableRow>` className
  - 모든 sticky `<TableCell>` className (4개 left-sticky 셀 + 날짜별 3개 셀)
- Grand Total 행은 이미 `bg-muted` (불투명) 이라 변경 불필요
- 데이터 행의 `text-muted-foreground/40` (Qty/Man 0일 때)은 유지 — sticky 아래에서만 비치는 게 아니라 본인 행 표시이므로 무관

### 2) `src/pages/analysis/DmrDashboardPage.tsx`

- Per-workplace Total 행의 `bg-muted/70` → `bg-muted` 로 교체 (TableRow + 모든 sticky TableCell)
- Grand Total 행은 변경 없음

### 3) 시각적 구분

Grand Total과 Per-metric/Per-workplace Total이 둘 다 `bg-muted` 단색이 되면 구분이 약해지므로, Per-metric/Per-workplace 행은 `bg-muted` + 약간 작은 글자 강조(`font-semibold` 유지)로 두고, Grand Total은 `font-bold border-b` 로 시각적 위계 유지. 색 차이 대신 굵기/구분선으로 구분합니다.

## 검증

- DMR Dashboard에서 표를 세로 스크롤 → Total 영역 아래에서 협력사 이름/숫자가 비쳐 보이지 않음 확인
- Productivity 표에서도 동일 확인
- 5월 25일 기준 Total 숫자(T&C 67, Defect 244, Post TOP 51) 그대로 표시되는지 확인
