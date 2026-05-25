## 변경

`src/pages/analysis/DmrDashboardPage.tsx` 의 Breakdown by Subcontractor × Date 테이블에서 Per-workplace Total 행 (T&C / Defect / Post TOP) 을 제거하고 **Grand Total 1행만** 남깁니다.

## 수정 내용

1. **Per-workplace Total 행 제거** (482~507 라인 블록 삭제)
   - `{selectedWp.map((wRow, wIdx) => { ... return <TableRow ...> ... })}`
2. **Grand Total 셀의 `rowSpan` 조정**
   - 현재 `rowSpan={totalRowCount}` (= 1 + selectedWp.length)
   - → `rowSpan={1}` 또는 rowSpan 속성 제거 (단일 행이므로 불필요)
   - `totalRowCount` 변수도 미사용이면 정리
3. **Sticky 오프셋 상수 유지**
   - Grand Total `top: TOP_TOTAL_BASE` 그대로
   - 아래 데이터 행과 Header 사이 공간만 1행으로 축소

레이아웃/필터/계산 로직은 변경하지 않습니다.

## 검증

- DMR Dashboard → Breakdown 표에 Total 행이 1개만 나타남
- Total 행에 각 날짜의 `[Total, T&C Man, Defect Man, Post TOP Man]` 값이 정확히 표시됨 (예: 5월 25일 → Total 362, T&C 67, Defect 244, Post TOP 51)
- 세로 스크롤 시 Header 2행 + Total 1행만 sticky
