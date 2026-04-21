

# S-Curve 막대그래프 재구성 — 겹침(Overlay) 방식 + 조건부 색상

## 요약

현재 4개의 독립 막대(T1 Plan, T1 Actual, T2 Plan, T2 Actual)를 **2개의 겹침(overlay) 막대**로 재구성합니다. 각 버킷에서 T1 막대 1개, T2 막대 1개만 표시되며, Plan 위에 Actual이 겹쳐 칠해지고 부족/초과분이 조건부 색상으로 표현됩니다.

## 막대 구조 (각 버킷당 2개)

```text
T1 막대:
  ├─ 전체 높이 = max(plan, actual)
  ├─ 연한 파랑: plan 영역 (base)
  ├─ 진한 파랑: actual 영역 (overlay)
  ├─ 빨강: plan - actual (부족분, actual < plan일 때)
  └─ 진한 남색: actual - plan (초과분, actual > plan일 때)

T2 막대:
  ├─ 전체 높이 = max(plan, actual)
  ├─ 연한 초록: plan 영역 (base)
  ├─ 초록: actual 영역 (overlay)
  ├─ 빨강: plan - actual (부족분)
  └─ 아주 진한 초록: actual - plan (초과분)
```

## 색상 정의

| 항목 | 색상 |
|------|------|
| T1 Plan (base) | 연한 파랑 `hsl(220, 70%, 78%)` |
| T1 Actual (met) | 진한 파랑 `hsl(220, 70%, 40%)` |
| T1 Shortfall | 빨강 `hsl(0, 72%, 50%)` |
| T1 Excess | 진한 남색 `hsl(220, 80%, 25%)` |
| T2 Plan (base) | 연한 초록 `hsl(142, 50%, 75%)` |
| T2 Actual (met) | 초록 `hsl(142, 60%, 40%)` |
| T2 Shortfall | 빨강 `hsl(0, 72%, 50%)` |
| T2 Excess | 아주 진한 초록 `hsl(142, 70%, 20%)` |

## 기술 구현

### 1. `src/lib/dashboard-utils.ts` — SCurvePoint 필드 변경

기존 `t1BarPlan`, `t1BarActual`, `t2BarPlan`, `t2BarActual` 4개 필드를 **Stacked Bar용 계산 필드**로 교체:

```typescript
export interface SCurvePoint {
  // ... 기존 cumulative 필드 유지
  // T1 stacked bar segments
  t1Met: number;            // min(plan, actual) — 달성분 (진한 파랑)
  t1Shortfall: number;      // max(0, plan - actual) — 부족분 (빨강)
  t1Excess: number;         // max(0, actual - plan) — 초과분 (진한 남색)
  // T2 stacked bar segments
  t2Met: number;            // min(plan, actual) — 달성분 (초록)
  t2Shortfall: number;      // max(0, plan - actual) — 부족분 (빨강)
  t2Excess: number;         // max(0, actual - plan) — 초과분 (진한 초록)
}
```

`buildSCurve` 함수에서 각 버킷의 비누적 plan/actual 값으로부터 위 세 세그먼트를 계산. `bucket > today`이면 모두 `null` (또는 0).

### 2. `src/pages/DashboardPage.tsx` — 차트 Bar 교체

기존 `<Bar>` 4개를 **Stacked Bar** 6개로 교체 (T1 3개 + T2 3개):

```jsx
{/* T1: Met + Shortfall stacked */}
<Bar yAxisId="right" dataKey="t1Met" stackId="t1" fill="hsl(220,70%,40%)" barSize={10} />
<Bar yAxisId="right" dataKey="t1Shortfall" stackId="t1" fill="hsl(0,72%,50%)" barSize={10} />
<Bar yAxisId="right" dataKey="t1Excess" stackId="t1" fill="hsl(220,80%,25%)" barSize={10} />

{/* T2: Met + Shortfall stacked */}
<Bar yAxisId="right" dataKey="t2Met" stackId="t2" fill="hsl(142,60%,40%)" barSize={10} />
<Bar yAxisId="right" dataKey="t2Shortfall" stackId="t2" fill="hsl(0,72%,50%)" barSize={10} />
<Bar yAxisId="right" dataKey="t2Excess" stackId="t2" fill="hsl(142,70%,20%)" barSize={10} />
```

T1과 T2는 각각 별도의 `stackId`를 사용하여 나란히 배치. 연한 색 base는 stacked segment 합으로 자연스럽게 표현됨 (Met + Shortfall = Plan 높이, Met + Excess = Actual 높이).

**chartConfig** 업데이트하여 새 필드명/색상 반영, 기존 `t1BarPlan`/`t1BarActual`/`t2BarPlan`/`t2BarActual` 제거.

## 수정 파일

| 파일 | 변경 |
|------|------|
| `src/lib/dashboard-utils.ts` | `SCurvePoint` 필드 교체 (Met/Shortfall/Excess), `buildSCurve` 계산 로직 수정 |
| `src/pages/DashboardPage.tsx` | `<Bar>` 4개 → 6개 (stacked), chartConfig 색상 변경 |

