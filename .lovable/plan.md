## Productivity (Nos / Man) Total 행 삭제

### 목적
Productivity (Nos / Man) 테이블 상단에 표시되는 모든 Total/합계 행을 제거하여, Subcontractor 개별 데이터 행만 남기기.

### 현재 구조
TableBody 시작 부분에 두 종류의 Total 행이 렌더링됨:
1. **Grand Total 행** — Plan (Total) / Actual (Total) 그룹 행 (2행)
2. **Metric Total 행** — T&C Planned, T&C Actual, Defect Planned, Defect Actual 각각의 합계 행 (최대 4행)

### 변경 내용
- `ProductivityTable.tsx` 내 TableBody 렌더링 블록에서 위 두 종류 Total 행 렌더링 코드 블록 전체 제거
- Total 행 전용으로만 사용되던 헬퍼 함수/변수 (`grandRows`, `totalMetrics`, `sumQty`, `sumMan`, `grandQty`, `grandMan`, `totalRowCount` 등) 함께 정리
- Subcontractor별 데이터 행 렌더링에는 영향 없음

### 범위
단일 파일: `src/components/analysis/ProductivityTable.tsx`