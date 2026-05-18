## 대상
`src/pages/docs/DocsExecutiveDashboardPage.tsx` 내 `ModuleSection`의 6/7-KPI 행. 변경은 **ABD 모듈**에만 적용 (Trade 개념이 ABD에만 존재, 또한 "Submitted" 라벨도 ABD 전용). OMM/Warranty/Spare Part는 기존 레이아웃 유지.

## 변경 사항

### 1. 숨김
- `Critical Delay (>30d)` 카드 제거
- `Due This Week` 카드 제거
- (관련 계산 `kpiDueIds`, `kpiCriticalIds`는 다른 곳에서 미사용 시 함께 정리)

### 2. ABD KPI 영역 — 2개 그룹으로 재구성

```text
┌─ Overview ──────────────────────────┐  ┌─ Overdue Response by Trade ───────────────────┐
│  [Total]  [Submitted]  [Remaining]  │  │  [Arch] [Struct] [Mech] [Elec] [Plumb] [Fire]…│
└─────────────────────────────────────┘  └───────────────────────────────────────────────┘
```

- **그룹 1 (Overview)**: 기존 `SummaryTile` 3개 (Total / Submitted / Remaining) — 현재 스타일·크기 유지
- **그룹 2 (Overdue Response by Trade)**: 현재 ABD에 존재하는 Trade들에 대해 작은 카드로 분할
  - 각 카드: Trade 단축 라벨(Arch/Mech/Elec 등) + Overdue Response 건수
  - 0건인 Trade도 표시할지 여부 → **0건은 숨김** (혼잡 방지)
  - 클릭 시 Raw Data로 `trade=<Trade>&overdue=1&overdue_type=response` 파라미터로 이동
  - "Overdue — Submission" 통합 카드도 그룹 1 옆 또는 그룹 2 헤더에 총합(badge)으로 한 줄 표시 → **별도 카드로 그룹 1 우측에 1개 유지** (Submission 지연도 가시성 필요)

### 3. OMM / Warranty / Spare Part
- Critical Delay & Due This Week 카드만 제거
- 나머지는 현재 레이아웃 그대로 (Total / Completed / Remaining / Overdue 등)

## 구현 메모
- 그룹은 `<div className="space-y-3">` 안에 두 개의 grid 블록으로 구성
- Trade별 집계는 기존 `filteredItems` 대신 `filteredRecords` 기반으로 `summariseByItem` 후 `recordTrade` map으로 Trade별 그룹화하여 `is_overdue_response` 카운트
- 소형 카드 컴포넌트는 기존 `SummaryTile`을 `size="sm"` variant로 사용하거나 간단한 인라인 카드(`rounded-md border px-3 py-2`)로 신규 작성

## 확인 사항
1. Overdue — Submission 통합 카드: **유지** vs **제거** — 본 플랜은 "유지" 가정
2. Trade 소형 카드에서 0건 Trade: **숨김** 가정
3. 변경 범위: **ABD만** vs **모든 모듈에 동일 패턴 (Trade가 없으면 Team으로 대체)**

위 3가지에 다른 의견 있으시면 알려주세요. 없으시면 가정대로 진행합니다.
