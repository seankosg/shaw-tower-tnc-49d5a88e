# Dashboard R1/R2 라벨을 R1S/R2A로 변경

Progress 매트릭스와 동일한 워딩(R1S = R1 Submission, R2A = R2 Approval)을 대시보드 표시에도 적용합니다.

## 변경 위치 (`src/pages/DashboardPage.tsx`)

### 1. Tier 2 Stage Cards (라인 339-340)
- `R1 (Sub→HDEC)` → **`R1S (Sub→HDEC)`** — `r1_status: 'Submitted'` 기준 카드
- `R2 (HDEC→Client)` → **`R2A (HDEC→Client)`** — `r2_status: 'Approved'` 기준 카드

### 2. Plan vs Actual 테이블 행 라벨 (라인 1035, 1045)
- `label: 'R1'` → **`label: 'R1S'`**
- `label: 'R2'` → **`label: 'R2A'`**

### 3. Tier 3 Alert Banner 설명 문구 (라인 349, 356)
- `Any stage (Pred/T1/T2/R1/R2) planned …` → **`Any stage (Pred/T1/T2/R1S/R2S/R2A) planned …`**
  (Tier 3 배너의 `isOverdueAllStages` 는 6단계 전체 — `r1`, `r2s`, `r2a` — 를 검사하므로 설명도 정확하게 동기화)

## 비범위

- 데이터 모델, 계산 로직, 클릭 라우팅 변경 없음 — **표시 라벨만** 변경.
- `stage: 'r1'`, `stage: 'r2'` 내부 키는 그대로 유지 (라우팅/필터 호환성 유지).
- 코드 주석 `// (Pred/T1/T2/R1/R2)` 같은 비표시 주석은 그대로 둠.
