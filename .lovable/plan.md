## 변경 사항

`src/components/analysis/ProductivitySummaryCards.tsx`의 두 번째 카드를 **Average Productivity**로 수정합니다.

### Card 2 — Average Productivity
- 제목: `Average Productivity`
- 단위: `Nos/Man`
- 계산:
  - `Plan = stats.plannedQty / manDenominator`
  - `Actual = stats.actualQty / manDenominator`
  - `manDenominator = stats.plannedMan > 0 ? stats.plannedMan : stats.actualMan`
  - 즉, 계획 인원(plannedMan)이 0이면 실제 인원(actualMan)으로 대체
  - 분모가 0이면 `-` 표시
- 소수점 2자리 표시 (생산성 값이 보통 작음)

### Card 1, 3 유지
- Card 1 (Average Work Volume), Card 3 (Difference Actual − Plan)은 변경 없음

### 영향 범위
- 단일 파일 수정: `src/components/analysis/ProductivitySummaryCards.tsx`
- 데이터 fetch 로직 변경 없음 (이미 plannedMan/actualMan 집계됨)
