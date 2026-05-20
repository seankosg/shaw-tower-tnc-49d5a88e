## 목표
Punch Dashboard 최상단 4개 카드를 클릭하면 Raw Data가 해당 카드 기준과 동일한 집합으로 필터링되도록 한다.

## 현황
| 카드 | 현재 onClick | 카드의 sub 카운트 기준 |
|---|---|---|
| Completed | `?completionStatus=Completed` ✅ | `actual_completion_date` 존재 |
| Planned Progress | (없음) ❌ | `planned_start_date ≤ today` |
| Actual Progress | (없음) ❌ | `actual_start_date` 존재 |
| In Delay | `?status=in_delay` ✅ | StartOverdue ∪ CompletionOverdue ∪ BehindSchedule |

## 변경 사항

### 1) `src/pages/PunchRawDataPage.tsx` — `status` 필터에 2개 케이스 추가
`filteredRows` useMemo 의 `status` switch 에 추가:
- `case 'planned_started'` → `r.planned_start_date && r.planned_start_date <= today`
- `case 'actual_started'` → `!!r.actual_start_date`

(In Delay 의 `in_delay` 케이스와 동일하게 row-level URL 필터)

### 2) `src/pages/PunchDashboardPage.tsx` — 2개 카드에 onClick 추가
- **Planned Progress** → `onClick={() => go('status=planned_started')}`
- **Actual Progress** → `onClick={() => go('status=actual_started')}`

Completed / In Delay 카드의 기존 onClick 은 유지.

## 검증
- Completed 카드 클릭 → Raw Data의 행수 = dashboard 의 `completed` 값
- Planned Progress 클릭 → 행수 = `plannedStartedByToday`
- Actual Progress 클릭 → 행수 = `actuallyStarted`
- In Delay 클릭 → 행수 = `inDelay`
