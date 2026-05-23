## 수정 내용

`src/components/analysis/ProductivitySummaryCards.tsx` 파일에서 3번 카드("Difference (Actual − Plan)")를 삭제하고, 남은 2개 카드에 맞춰 그리드 레이아웃을 조정합니다.

### 변경 상세

1. **3번 카드 삭제**: "Difference (Actual − Plan)" 카드 및 관련 `diff`, `diffColor`, `diffSign` 변수 제거
2. **그리드 조정**: `grid-cols-1 sm:grid-cols-3` → `grid-cols-1 sm:grid-cols-2` (2개 카드에 맞춰 2열로 변경)
3. **불필요한 변수 정리**: `diff`, `avgPlan`, `avgAct` 등 3번 카드에서만 사용되던 값 정리
