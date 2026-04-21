

# Dashboard Header Cards 재설계 — 시스템 및 3단계별 현황 요약

## 요약

현재 8개의 KPI 카드 + 2개의 Alert Banner를 **2-tier 구조**로 재설계합니다:
- **Tier 1**: 전체 요약 카드 1줄 (Systems, Total, Done, Remaining, Progress, Overdue)
- **Tier 2**: Pred / T1 / T2 단계별 현황 카드 3개 (각각 Total, Done, Remaining, Progress%, Overdue)

Alert Banner(Overdue/At-Risk)는 유지하되 Tier 1 Overdue 카드와 중복되지 않도록 조정합니다.

## 레이아웃

```text
┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐
│  Systems    │  Total      │  Done       │  Remaining  │  Progress   │  Overdue    │
│  12         │  3,456      │  1,234      │  2,222      │  ██░░ 35.7% │  87 (red)   │
└─────────────┴─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘

┌──────────── Predecessor ─────────┬──────────── T1 ───────────────────┬──────────── T2 ───────────────────┐
│  Total: 3,456  Done: 2,100       │  Total: 3,456  Done: 1,500       │  Total: 3,456  Done: 800          │
│  Remaining: 1,356                │  Remaining: 1,956                │  Remaining: 2,656                │
│  ████████░░░░ 60.8%   OD: 23     │  ██████░░░░░░ 43.4%   OD: 31     │  ████░░░░░░░░ 23.1%   OD: 33     │
└──────────────────────────────────┴──────────────────────────────────┴──────────────────────────────────┘
```

## 데이터 정의

**Tier 1 — Overall**
| 항목 | 계산 |
|------|------|
| Systems | `new Set(subtests.map(s => s.system_id)).size` (active systems with subtests) |
| Total | `subtests.length` |
| Done | T2 status = Done인 subtest 수 (최종 완료 기준) |
| Remaining | Total - Done |
| Progress | Done / Total * 100 (Progress bar 포함) |
| Overdue | T1 또는 T2 planned date 지남 & Done 아님 (기존 `isOverdue` 함수) |

**Tier 2 — Stage별 (Pred, T1, T2)**
| 항목 | Pred | T1 | T2 |
|------|------|-----|-----|
| Total | subtests.length | subtests.length | subtests.length |
| Done | pred_status = Done | t1_status = Done | t2_status = Done |
| Remaining | Total - Done | Total - Done | Total - Done |
| Progress% | Done / Total * 100 | Done / Total * 100 | Done / Total * 100 |
| Overdue | pred_planned_date < today & pred_status != Done | t1_planned_date < today & t1_status != Done | t2_planned_date < today & t2_status != Done |

## 변경 내용

### 1. `src/pages/DashboardPage.tsx` — KPI 계산 확장

`kpis` useMemo에 다음 필드 추가:
- `systemCount`, `totalDone` (T2 기준), `remaining`
- `predDone`, `predOverdue`, `predPct`
- `t1Done`, `t1Overdue`, `t1Pct`
- `t2Done`, `t2Overdue`, `t2Pct`

### 2. `src/pages/DashboardPage.tsx` — KPI Strip UI 교체

기존 `grid-cols-4` 8개 카드 → 2개 섹션:

**Tier 1**: `grid-cols-6` (md) / `grid-cols-3` (sm) — 6개 카드 (Systems, Total, Done, Remaining, Progress with bar, Overdue)

**Tier 2**: `grid-cols-3` — StageCard 컴포넌트 3개 (Pred, T1, T2). 각 카드 내부에 Total/Done/Remaining/Progress bar/Overdue를 compact하게 표시.

### 3. 새 컴포넌트: `StageCard`

`DashboardPage.tsx` 내 로컬 컴포넌트로 추가:
```typescript
function StageCard({ stage, total, done, remaining, pct, overdue, onClick }: {
  stage: string;        // "Predecessor" | "T1" | "T2"
  total: number;
  done: number;
  remaining: number;
  pct: number;          // 0-100
  overdue: number;
  onClick?: () => void;
})
```
- Progress bar (`<Progress />`) 포함
- Overdue > 0이면 빨간색 뱃지 표시
- 클릭 시 해당 stage로 필터된 subtest 목록으로 이동

### 4. Alert Banner 유지

Overdue/At-Risk Alert Banner는 그대로 유지 (상세 설명 + View 버튼 역할).

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/pages/DashboardPage.tsx` | KPI 계산 확장, KPI Strip UI 재구성, StageCard 컴포넌트 추가, 기존 KpiCard 일부 유지 |

