# Stage Card 라벨 단순화

대시보드 Tier 2 Stage Cards에서 R1S/R2A 카드의 부가설명을 제거하고 단순한 라벨만 표시.

## 변경 (`src/pages/DashboardPage.tsx`, 라인 339-340)

- `stage="R1S (Sub→HDEC)"` → **`stage="R1S"`**
- `stage="R2A (HDEC→Client)"` → **`stage="R2A"`**

다른 변경 없음.
