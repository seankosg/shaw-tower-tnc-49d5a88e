## 요약
`DmrDashboardPage.tsx`의 **Breakdown by Subcontractor × Date** 테이블에 Productivity 테이블과 동일한 방식의 sticky Total 섹션을 헤더 바로 아래에 추가합니다. 기존 하단 `Day Total` 행은 중복되므로 제거합니다.

## 변경 파일
- `src/pages/analysis/DmrDashboardPage.tsx` (line 393~489 영역)

## 변경 내용

### 1) Total 섹션 구조 (헤더 직하단)
- **Grand Total 행 1개** (Productivity의 Plan/Actual grand 행과 동일한 스타일)
  - 라벨: `Total (All)`
  - Average · Total = `floor(grandTotal / denom)`
  - Average · 각 workplace = `floor(Σdates colWpTotal(d, w) / denom)` (기존 Day Total 행 로직 재사용)
  - 날짜별 Total = `dayTotalByDate.get(d)`
  - 날짜별 workplace 셀 = `colWpTotal(d, w)`
  - Row Total 셀 = `grandTotal`
- **Workplace별 Total 행** (`selectedWp.length`개)
  - 라벨: workplace 이름 (예: `T&C Total`, `Defect Total`, `Post TOP Total`)
  - Average · Total = `floor(Σdates colWpTotal(d, w) / denom)` (자신의 wp만)
  - Average · workplace 컬럼: 자기 컬럼에만 값, 나머지는 빈칸
  - 날짜별 Total 컬럼 = `colWpTotal(d, w)` (해당 wp만)
  - 날짜별 workplace 컬럼: 자기 컬럼에만 값, 나머지는 빈칸
  - Row Total = `Σdates colWpTotal(d, w)`

### 2) 좌측 Sticky `Total` 라벨 병합
- 첫 grand 행에 `rowSpan = 1 + selectedWp.length`인 sticky 좌측 셀 (`Subcontractor` 컬럼 자리) 표시 → 라벨 `Total`, `bg-muted`, 가운데 정렬.

### 3) Sticky 처리
- 헤더 2행: 기존 그대로 (위치 변경 없음 — 현 코드에는 `top: 0` sticky가 없으니 같은 패턴 유지). 단, **세로 sticky 적용**:
  - 현재 컨테이너 `overflow-x-auto` → `overflow-auto` + `max-h-[70vh]`
  - 헤더 두 행에 `sticky top: 0 / top: 32px` + 적절한 zIndex 부여 (Productivity와 동일 상수 H_HEAD=32, Z_HEAD=40, Z_HEAD_LEFT=50)
  - Total 행들에 `sticky top` 누적 (`TOP_TOTAL_BASE = 64`, 행마다 `+H_HEAD`), Z_TOTAL=30 / Z_TOTAL_LEFT=35
  - 좌측 sticky 컬럼들(Subcontractor, Average Total, Average WP들)은 Z_HEAD_LEFT / Z_TOTAL_LEFT 사용

### 4) 하단 `Day Total` 행 제거
- 기존 line 458~482 행은 새 Total 섹션과 동일 정보를 표시하므로 삭제.

## 검증
- DMR Dashboard에서 Breakdown 테이블 진입 시 헤더 아래에 `Total (All)` + workplace별 Total 행이 표시되고, 모든 협력사 합과 일치.
- 세로 스크롤 시 헤더 + Total 섹션 sticky 고정.
- 가로 스크롤 시 좌측 `Total` 라벨, Average 컬럼들이 정상 sticky.
- 필터 변경(Subcontractor / Team / Workplace) 시 Total 값이 즉시 갱신.