

## Breakdown 표 재디자인 — Plan vs Actual + Variance

### 핵심 변경
현재 표는 "Done / In Progress / Not Started / Overdue / T1% / T2%"로 상태 분포만 보여주고, **계획대비 실적·차이가 직관적으로 안 드러남**. 이를 **Plan / Actual / Variance** 중심 표로 재구성.

### 새 표 구조 (System / Subcon / Sub-Sub / HDEC PIC 공통)

서브테스트 단위 카운트 기준 (T1, T2 각각). 실적 = `actual_date <= 오늘`인 건수, 계획 = `planned_date <= 오늘`인 건수.

| 그룹 | Total Subtests | **누계 (To-Date)** ||| **금일 (Today)** ||| Progress |
|---|---|---|---|---|---|---|---|---|
| | | Plan | Actual | **Δ** | Plan | Actual | **Δ** | |

각 셀은 **T1 / T2**를 한 줄에 표기 (예: `45 / 30`). Variance Δ:
- **음수 (지연)**: 빨강, `-5` 형식
- **0 / 양수**: 회색 / 녹색
- 계획보다 실적이 적으면 음수

**Progress** 컬럼: 작은 dual-bar (T1 누계실적/Total, T2 누계실적/Total) + % 텍스트.

**Total Subtests** = 그룹의 전체 subtest 수 (= "최종 목표량"으로서 분모 역할).

### 정렬 / 인터랙션
- 기본 정렬: **Cumulative Variance가 가장 큰 음수 (가장 지연된)** 순 — Overdue 정렬 대체
- 정렬 토글: Total / 누계Δ / 금일Δ
- 셀 클릭 drill-down:
  - "누계 Plan" 클릭 → SubtestList `?<group>=...&t1_planned_to=오늘` (또는 t2)
  - "누계 Actual" 클릭 → `?<group>=...&t1_actual_to=오늘`
  - "누계 Δ (음수)" 클릭 → `?<group>=...&status=overdue`
  - "금일 Plan" 클릭 → `?<group>=...&t1_planned_on=오늘`
  - 그룹명 클릭 → 그룹 전체 필터

### 데이터 모델 추가
`dashboard-utils.ts`에 새 헬퍼:
```ts
interface PlanActualRow {
  key: string; label: string;
  totalSubtests: number;
  t1: { cumPlan, cumActual, todayPlan, todayActual };
  t2: { cumPlan, cumActual, todayPlan, todayActual };
}
function aggregatePlanActualByGroup(subs, today, groupKey, groupLabel): PlanActualRow[]
```
계산 규칙:
- `cumPlan`: `t1_planned_date <= today` 건수
- `cumActual`: `t1_actual_date != null && t1_actual_date <= today` 건수
- `todayPlan`: `t1_planned_date == today`
- `todayActual`: `t1_actual_date == today`
- `Δ = Actual − Plan` (음수 = 지연)

기존 `aggregateByGroup` (Tests Done/WIP 기반)은 KPI strip / Top Overdue용으로 유지.

### SubtestList 필터 확장
신규 query param 처리:
- `t1_planned_to`, `t2_planned_to`, `t1_actual_to`, `t2_actual_to` (≤ 날짜)
- `t1_planned_on`, `t2_planned_on`, `t1_actual_on`, `t2_actual_on` (= 날짜)

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/lib/dashboard-utils.ts` | `aggregatePlanActualByGroup` + `PlanActualRow` 타입 추가 |
| `src/pages/DashboardPage.tsx` | `GroupTable` → `PlanActualTable`로 교체, 4개 탭 모두 새 데이터 사용 |
| `src/pages/SubtestList.tsx` | 신규 날짜 query param (`*_to`, `*_on`) 필터링 로직 추가 |

DB / Edge function / 마이그레이션 변경 없음.

### 모바일 대응
430px 뷰포트에선 컬럼이 많으므로 표는 가로 스크롤 (`overflow-x-auto`). "누계/금일" 그룹 헤더는 colspan으로 시각적으로 묶음.

