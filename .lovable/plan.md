## 변경 사항

Category Classification & Dispute 섹션의 4개 PriorityCard(Total / Cat. A / Cat. B / No Cat.) 상단 우측, 전체 갯수 값 옆에 **잔여 갯수(remaining)** 를 표시하는 붉은색 칩을 추가합니다.

### 정의
- 잔여 = `stats.total - stats.closure` (Closure 미완료 건수)
- 잔여가 0이면 칩은 비활성(muted) 스타일로 표시하고 클릭 비활성화

### UI (`src/pages/DefectDashboardPage.tsx`, `PriorityCard` 컴포넌트, 909~928 line 근처)
- 우측 영역을 `flex items-center gap-2`로 묶고 다음 순서로 배치:
  1. 잔여 칩 — 작은 라운드 chip, `border-destructive/40 bg-destructive/10 text-destructive`, 라벨 `Rem {remaining}`, 호버 시 진하게, `title="Closure 미완료 잔여"`, `OD` 칩과 동일한 사이즈 토큰 사용
  2. 기존 total 숫자 (`text-2xl font-bold`)
- 잔여 0일 때 muted 스타일 (OD 칩과 동일 패턴)

### Drill-down 연동
- `PriorityCard` props에 `onRemainingClick?: () => void` 추가
- 칩 클릭 시 `stopPropagation` 후 호출
- 호출부(462~483 line)에서 각 카드에 다음 라우팅 추가:
  - Total: `goRaw({ ...teamParam, notClosureDone: 'true' })`
  - Cat. A: `goRaw({ ...teamParam, priority: 'Cat A - Major Defect (Before SC)', notClosureDone: 'true' })`
  - Cat. B: `goRaw({ ...teamParam, priority: 'Cat B - Minor Defect', notClosureDone: 'true' })`
  - No Cat.: `goRaw({ ...teamParam, priority: '__EMPTY__', notClosureDone: 'true' })`

`notClosureDone=true` 파라미터는 Captured By 섹션 등 다른 잔여 카운트 drill-down(615 line 등)에서 이미 사용 중인 동일 컨벤션입니다.

### 범위 외
- 백엔드/집계 로직 변경 없음 (UI + 기존 라우팅 파라미터만 사용)
- 다른 카드/섹션 디자인은 그대로 유지
