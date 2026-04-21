

# Dashboard & Schedule 페이지에 Team 필터링/그룹핑 추가

## 요약
Dashboard와 Schedule 페이지에서 Team(Mech/Elec/Arch/Supp)별 필터링 드롭다운과 그룹핑 옵션을 추가합니다.

---

## 1. SubtestForDashboard 타입에 team 필드 추가

**파일**: `src/lib/dashboard-utils.ts`

`SubtestForDashboard` 인터페이스에 `team?: string | null` 추가. 이 타입은 Dashboard와 Schedule 모두에서 사용됩니다.

---

## 2. Supabase 쿼리에 team 필드 포함

**파일**: `src/pages/DashboardPage.tsx`, `src/pages/SchedulePage.tsx`

두 페이지의 `.select()` 쿼리에 `team` 필드를 추가하여 데이터를 가져옵니다.

---

## 3. Dashboard 페이지 — Team 필터 + "By Team" 탭 추가

**파일**: `src/pages/DashboardPage.tsx`

- **Team 필터 드롭다운** 추가 (All / Mech / Elec / Arch / Supp). 선택 시 `subtests`를 필터링하여 모든 KPI, S-Curve, 테이블에 반영.
- **Plan vs Actual Breakdown** 탭에 **"By Team"** 탭 추가. `aggregatePlanActualByGroup`의 groupKey로 `s.team ?? '(None)'` 사용.

---

## 4. Schedule 페이지 — Team 필터 + Group By Team 옵션 추가

**파일**: `src/pages/SchedulePage.tsx`, `src/lib/schedule-utils.ts`

- `ScheduleGroupBy` 타입에 `'team'` 추가, `GROUP_LABELS`에 `team: 'Team'` 추가.
- `getGroupKey` 함수에 `team` 케이스 추가: `s.team ?? '(None)'.
- **Team 필터 드롭다운** 추가 (All / Mech / Elec / Arch / Supp). 선택 시 subtests를 필터링.
- Group 탭에 **Team** 탭 추가.

---

## 5. Schedule Cache 타입 업데이트

**파일**: `src/lib/schedule-cache.ts`

`SubtestForDashboard`에 team이 포함되므로 캐시는 자동으로 반영됨. 별도 수정 불필요.

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/lib/dashboard-utils.ts` | `SubtestForDashboard`에 `team` 필드 추가 |
| `src/lib/schedule-utils.ts` | `ScheduleGroupBy`에 `'team'` 추가, `getGroupKey` 업데이트 |
| `src/pages/DashboardPage.tsx` | Team 필터 드롭다운 + "By Team" 탭 추가, select에 team 포함 |
| `src/pages/SchedulePage.tsx` | Team 필터 드롭다운 + Group By Team 탭 추가, select에 team 포함 |

