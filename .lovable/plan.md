## Critical Level Summary 재설계 (한 줄 메타 + 진도율 바)

기존 chip 그리드 형태를 폐기하고, Critical Level 별로 **한 줄 헤더 + 진도율 바** 형태의 카드 목록으로 다시 그립니다. 카드 헤더의 큰 레이블이 Critical Level (High / mid-High / Medium / mid-Low / Low / Unspecified)이고, 그 옆으로 메타 정보가 한 줄에 표시됩니다.

### 시각 구조 (한 카드)

```text
┌────────────────────────────────────────────────────────────────────────┐
│ ▌ High                                                                 │
│   ─────────────────────────────────────────────────────────────────    │
│   12 items · Civil, MEP, Architecture · Pre-Eng 8/12 Ready             │
│   Earliest 2026-04-01 · Latest 2026-06-30                              │
│                                                                        │
│   Overall Progress              [████████░░░░░░░░] 62%                 │
└────────────────────────────────────────────────────────────────────────┘
```

- **레이블 (Critical Level)**: 큰 글자(`text-2xl font-bold`)로 강조, 좌측 색상 막대(accent bar) 유지
- **메타 한 줄**: `{total} items · {Main Cat 요약} · Pre-Eng {ready}/{total} Ready · Earliest {date} · Latest {date}`
  - `Main Cat`은 `category1` 기준으로 그룹 내 distinct 값을 빈도 순으로 최대 3개 표시 (`Civil, MEP, Architecture`), 초과시 `+N`
  - 줄 길이 보호를 위해 `flex-wrap` + `text-sm text-muted-foreground`
- **진도율 바**: `weightedProgress(items)` 의 `actual` 값을 사용해 `Progress` 컴포넌트로 표시, 우측에 `XX%` 텍스트
- 4 gate chip 그리드 / earliest·latest 라벨 별도 표시는 제거 (한 줄 메타로 통합)

### 레이아웃

- 카드 1개의 너비는 전체 폭(또는 `xl:grid-cols-2`)을 활용. chip 카드 형태가 아니므로 좌→우로 정보가 흐르게.
- 카드 전체 클릭 시 `?criticalLevel={level}` 로 RawData 이동 (기존 동작 유지)
- chip 클릭 드릴다운 제거 → 4 gate 별 pending 드릴다운은 기존 Pre-Engineering Pipeline 카드에 위임

### 데이터 (`src/lib/punch-dashboard-utils.ts`)

`CriticalLevelSummary` 확장:

```ts
export interface CriticalLevelSummary {
  level: CriticalLevel;
  total: number;
  earliestStart: string | null;
  latestFinish: string | null;
  preEngReady: number;          // pre_engineering_ready = true 카운트
  mainCategories: Array<{ name: string; count: number }>; // category1 빈도, 내림차순
  progressActual: number;       // weightedProgress(items).actual
  progressPlanned: number;      // 참고용 (variance 표시는 하지 않음)
  gates: Record<GateKey, GateCount>; // 호환용으로 남겨두되 UI에서 미사용
}
```

`summarizeByCriticalLevel(items)`에 위 필드 채우는 로직 추가:

- `preEngReady`: `items.filter(r => r.pre_engineering_ready).length`
- `mainCategories`: `category1` 정규화(`trim`, 빈 값은 `Uncategorized`), Map으로 카운트 후 `count` 내림차순 정렬
- `progressActual` / `progressPlanned`: 기존 `weightedProgress` 재사용 (이 파일 내 import)

### UI (`src/pages/PunchDashboardPage.tsx`)

- 기존 `CriticalLevelGroupCard` (chip 그리드) 컴포넌트 제거
- 새 `CriticalLevelRowCard` 컴포넌트로 위 시각 구조 렌더
- `summarizeByCriticalLevel`은 `items`만 받도록 시그니처 유지(이미 통과)
- 상위 컨테이너는 `space-y-3` (또는 `xl:grid-cols-2 gap-3`) — 한 줄 메타가 길어질 수 있으므로 기본은 단일 컬럼
- Pre-Engineering Pipeline / Critical Level Summary 위치 관계는 그대로 유지 (Data Quality 카드 위)

### 변경 파일

- `src/lib/punch-dashboard-utils.ts` — `CriticalLevelSummary` 확장 + `summarizeByCriticalLevel` 로직
- `src/pages/PunchDashboardPage.tsx` — 카드 렌더링 컴포넌트 교체

DB/RLS/백엔드 변경 없음.
