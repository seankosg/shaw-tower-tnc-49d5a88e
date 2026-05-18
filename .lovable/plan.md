## ABD KPI 영역 — 같은 Tier 2등분 재구성

### 대상
`src/pages/docs/DocsExecutiveDashboardPage.tsx` 의 `isAbd` 분기 (L404~L461). OMM/Warranty/Spare Part 분기는 변경 없음.

### 새 레이아웃
```text
┌───────────────────────────────────┬───────────────────────────────────┐
│  Overview                          │  Overdue by Discipline             │
│  ┌─────────┬─────────┬─────────┐   │  Submission                        │
│  │ Total   │Submitted│Remaining│   │  ┌─Arch─┬─Mech─┬─Elec─┐            │
│  │  XXX    │   XX %  │  XX     │   │  │  N   │  N   │  N   │            │
│  │         │ progress│         │   │  └──────┴──────┴──────┘            │
│  └─────────┴─────────┴─────────┘   │  Response                          │
│                                    │  ┌─Arch─┬─Mech─┬─Elec─┐            │
│                                    │  │  N   │  N   │  N   │            │
│                                    │  └──────┴──────┴──────┘            │
└───────────────────────────────────┴───────────────────────────────────┘
```

컨테이너: `grid grid-cols-1 lg:grid-cols-2 gap-3`. 좁은 화면(<lg)에서는 세로로 적층.

### 카드 1 — Overview (왼쪽)
- 단일 `Card` (`rounded-xl border bg-card p-3.5`)
- 내부 3열 (`grid grid-cols-3 divide-x`)
  - **Total** — value, 클릭 시 `extraParams()`만 적용
  - **Submitted** — value + `XX %` sublabel + `Progress` 바, 클릭 시 `bucket=done` 추가
  - **Remaining** — `kpiTotal − kpiCompleted`, 클릭 시 `extraParams()`만 적용
- 각 셀: `flex flex-col items-start px-3 py-2`, label은 muted 작은 글자, value는 큰 숫자

### 카드 2 — Overdue by Discipline (오른쪽)
- 단일 `Card` (`rounded-xl border bg-card p-3.5`)
- 내부 2개 섹션 (Submission, Response), 각 섹션마다 3개 작은 칩
- 칩 그리드: `grid grid-cols-3 gap-2`
- 각 칩(버튼): trade 라벨(Arch/Mech/Elec) + 카운트
  - Submission 칩: 카운트 색 `text-red-600 dark:text-red-400`
  - Response 칩: 카운트 색 `text-amber-600 dark:text-amber-400`
- 클릭: `{ trade: <full name>, overdue: '1', overdue_type: 'submission' | 'response' }`

### 데이터 모델
기존 `tradeOverdueResponse` memo를 일반화하여 단일 `disciplineOverdue` memo로 통합:
```ts
const DISCIPLINES: TradeCategory[] = ['Architecture', 'Mechanical', 'Electrical'];

const disciplineOverdue = useMemo(() => {
  if (!isAbd) return null;
  const make = (predicate: (it: ItemRow) => boolean) => {
    const m = new Map<TradeCategory, number>();
    DISCIPLINES.forEach(d => m.set(d, 0));
    for (const it of filteredItems) {
      if (!predicate(it)) continue;
      const t = resolveTrade({ trade: it.trade, sheet_name: it.document_no }) as TradeCategory;
      if (DISCIPLINES.includes(t)) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return DISCIPLINES.map(d => ({ trade: d, count: m.get(d) ?? 0 }));
  };
  return {
    submission: make(it => it.is_overdue_submission),
    response:   make(it => it.is_overdue_response),
  };
}, [isAbd, filteredItems]);
```

### 제거/대체되는 기존 요소
- 4-셀 SummaryTile 그리드 (L407-422) → Overview 카드로 대체
- "Overdue — Response by Trade" 박스 (L424-460) → Overdue by Discipline 카드의 Response 섹션으로 흡수
- 기존 `tradeOverdueResponse` memo (L313-326) → `disciplineOverdue`로 교체
- 사용하지 않게 되는 import: `SummaryTile`은 OMM 등에서 계속 사용되므로 유지

### 가정
- "세개의 공종" = **Architecture / Mechanical / Electrical** (가장 일반적인 3대 공종, 기존 `TRADE_SHORT`의 Arch/Mech/Elec과 일치)
- 다른 공종으로 원하시면 알려주세요 (예: Structure, HVAC 등)

### 영향 범위
단일 파일 수정: `src/pages/docs/DocsExecutiveDashboardPage.tsx`. 다른 모듈/페이지에 영향 없음.