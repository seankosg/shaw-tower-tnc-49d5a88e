## 목표

`src/components/analysis/ProductivityTable.tsx` 의 Total 영역에서 `Total` rowSpan 셀이 sticky 동작 불일치로 헤더에 걸리는 문제 해결.

## 수정

### `src/components/analysis/ProductivityTable.tsx`

1. **rowSpan Total 셀 제거** (현재 Grand Total `grandRows.map` 의 `isFirst && (...rowSpan...)` 블록)
2. **각 Total 행(`grandRows` 2개 + `totalMetrics` 4개)마다 자체 sticky 좌측 라벨 셀 추가**
   - 모든 행: `<TableCell sticky left-0 bg-muted style={{ top: <행별 top> }}>` 
   - 첫 번째 행만 라벨에 "Total" 표시 (font-bold, 가운데 정렬), 나머지 행은 빈 셀
   - width: W_SUB
3. **Metric 라벨 셀의 left 오프셋 유지** (`left: W_SUB`)
4. **각 행의 top 계산식 유지** (`TOP_TOTAL_BASE + H_HEAD * idx`)

이렇게 하면:
- 모든 Total 셀이 동일한 행 단위 sticky 동작
- 가로 스크롤 시 좌측 "Total" 라벨이 행과 함께 정확히 따라옴
- rowSpan 으로 인한 sticky anchor 문제 사라짐

### 시각적 유지

- 첫 행 ("Plan (Total)") 의 좌측 라벨에 굵은 "Total" 텍스트
- 나머지 5행의 좌측 라벨은 동일 `bg-muted` + 빈 텍스트
- 시각적으로 하나의 "Total" 블록처럼 보임

## 검증

- 세로 스크롤 시 Total 영역 6행 모두 동일하게 sticky로 머무름
- 가로 스크롤 시 좌측 "Total" 라벨이 행과 함께 따라오고 잔상 없음
- 헤더 `Subcontractor` 영역에 걸리지 않음
