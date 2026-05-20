## 변경 대상
`src/pages/PunchDashboardPage.tsx` 의 Tier 1 (최상단) 4개 카드 그리드.

## 새 카드 구성

| # | 카드 | 메인 값 | 하단 sub (개수/전체) | 클릭 |
|---|---|---|---|---|
| 1 | Completed | `completed/total` % | `{completed} / {total} items` | `?completionStatus=Completed` |
| 2 | Planned Progress | `stats.w.planned` % (가중) | `{plannedCount} / {total} items` — 여기서 `plannedCount` = 오늘 기준 planned_start_date ≤ today인 item 수 | (이동 없음) |
| 3 | Actual Progress | `stats.w.actual` % (가중) | `{started} / {total} items` — `started` = actual_start_date 존재 item 수 (WIP + Completed) | (이동 없음) |
| 4 | In Delay | 중복 제거된 카운트 | `{inDelay} / {total} items` | `?status=in_delay` |

- Variance 카드는 제거.
- Tier 2 (Pre Engineering Blocked / Start Overdue / Completion Overdue / Behind Schedule) 카드는 그대로 유지.

## In Delay 계산 (중복 제거)
`stats` useMemo 내부에 추가:

```ts
const inDelay = rows.filter((r) =>
  isStartDelayed(r, asOf) || isCompletionOverdue(r, asOf) || isBehindSchedule(r)
).length;
const plannedStartedByToday = rows.filter((r) =>
  r.planned_start_date && r.planned_start_date <= asOf
).length;
const actuallyStarted = rows.filter((r) => !!r.actual_start_date).length;
```

`filter`가 row를 1회만 통과시키므로 합집합 자동 중복 제거.

## Raw Data 필터 추가
`src/pages/PunchRawDataPage.tsx` 의 `status` switch에 신규 case:

```ts
case 'in_delay':
  next = next.filter((r) => {
    const startDelayed = !r.actual_start_date && r.planned_start_date && r.planned_start_date < today;
    const overdue = !r.actual_completion_date && r.planned_completion_date && r.planned_completion_date < today;
    const behind = r.health_status === 'behind' || r.health_status === 'critical';
    return startDelayed || overdue || behind;
  });
  break;
```

## 시각 처리
- Completed / Planned Progress / Actual Progress: 기존 `ProgressKpiCard` 재사용 (`sub` prop으로 "n / total items" 표기)
- In Delay: 기존 `RiskKpiCard` 재사용 (tone="danger"), `count`+`percent`+`sub="{inDelay} / {total} items"`
