# Doc Executive Dashboard — 최상단 KPI Strip 개편

## 목표
`PortfolioKpiStrip`에서:
- **삭제**: `Due This Week`, `Critical Delay (>30d)` 카드
- **Overdue 카드 확장**: 메인 Overdue 수치 아래(또는 옆)에 **Submission** / **Response** 소형 분해 카드를 함께 표시

## 변경 내용 (`src/pages/docs/DocsExecutiveDashboardPage.tsx`)

### 1. `portfolioKpi` useMemo 단순화
- `dueThisWeek`, `criticalDelay` 계산 제거 (`isDueThisWeek`, `criticalDelayItemIds` 호출 삭제)
- 새 필드 추가:
  - `overdueSubmission` = `summaries.filter(i => i.is_overdue_submission).length`
  - `overdueResponse`   = `summaries.filter(i => i.is_overdue_response).length`

### 2. `PortfolioKpiStrip` 레이아웃 변경
기존: 6개 동일 크기 타일 (`lg:grid-cols-6`)
변경: 4개 기본 타일 + Overdue는 sub-breakdown 포함

```text
┌────────┬──────────┬──────────┬──────────────────────────┐
│ Total  │Completed │Remaining │ Overdue (큰 수)          │
│        │          │          │ ┌──────────┬───────────┐ │
│        │          │          │ │Sub  N    │ Resp  N   │ │
│        │          │          │ └──────────┴───────────┘ │
└────────┴──────────┴──────────┴──────────────────────────┘
```
- 그리드: `grid-cols-2 md:grid-cols-2 lg:grid-cols-4` (Overdue 타일이 마지막)
- Overdue 타일 내부:
  - 상단: 라벨 + AlertTriangle 아이콘
  - 중앙: 큰 숫자 (`kpi.overdue`)
  - 하단: 2분할 sub-card
    - **Submission** — 빨강 톤 (`text-red-600`), 우리측 지연
    - **Response** — 앰버 톤 (`text-amber-600`), 상대측 지연
  - 둘 다 0이면 톤 dim 처리

### 3. 사용하지 않는 import 정리
- `Flame`, `CalendarClock` 아이콘 import 제거
- `isDueThisWeek`, `criticalDelayItemIds` import 제거

## 영향 범위
- 파일: `src/pages/docs/DocsExecutiveDashboardPage.tsx`만 수정
- 클릭/네비게이션 동작 없음 (현재도 strip은 비클릭). 추후 필요 시 별도 작업.
