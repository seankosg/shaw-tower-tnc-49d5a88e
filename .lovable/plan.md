

## Plan vs Actual Breakdown — "어제까지 누계" + "어제 당일" 컬럼 추가

### 변경 컨셉
현재 표는 **To-Date (오늘까지 누계)** + **Today (당일)** 2개 그룹. 사용자 요청:
1. **누계 기준 변경**: 오늘까지 → **어제까지 누계** (Cumulative as of Yesterday)
2. **신규 그룹 추가**: **Yesterday (어제 당일)** Plan/Actual/Δ
3. 결과: **3개 그룹** = `To-Yesterday (누계)` | `Yesterday (어제)` | `Today (오늘)`

### 새 표 구조

```
┌───────┬──────┬──────┬───────────────────┬───────────────────┬───────────────────┬──────────┐
│System │Total │Stage │ To-Yesterday 누계 │ Yesterday 어제   │ Today 오늘       │ Progress │
│       │      │      │ Plan│Actual│ Δ   │ Plan│Actual│ Δ   │ Plan│Actual│ Δ   │          │
├───────┼──────┼──────┼─────┼──────┼─────┼─────┼──────┼─────┼─────┼──────┼─────┼──────────┤
│SYS-001│  50  │ Pred │ 43  │  39  │ -4  │  2  │  1   │ -1  │  2  │  0   │ -2  │ ███░ 78% │
│       │      │ T1   │ 37  │  33  │ -4  │  3  │  2   │ -1  │  3  │  0   │ -3  │ ██░░ 66% │
│       │      │ T2   │ 28  │  20  │ -8  │  2  │  0   │ -2  │  2  │  0   │ -2  │ █░░░ 40% │
```

### 계산 규칙
어제 = `today - 1 day`

| 메트릭 | 정의 |
|---|---|
| `cumPlan` (누계) | `planned_date <= 어제` 건수 |
| `cumActual` (누계) | `actual_date != null && actual_date <= 어제` 건수 |
| `yesterdayPlan` | `planned_date == 어제` |
| `yesterdayActual` | `actual_date == 어제` |
| `todayPlan` | `planned_date == 오늘` |
| `todayActual` | `actual_date == 오늘` |

Predecessor도 동일 패턴 (T1 status 기반 actual은 누계만 의미가 있으므로, 어제/오늘 actual은 `t1_actual_date` 기준으로 사용).

### Drill-down URL
새로운 query param 추가 필요:
- `t{n}_planned_to=어제`, `t{n}_actual_to=어제` (이미 `_to` 패턴 지원, 값만 어제로)
- `t{n}_planned_on=어제/오늘`, `t{n}_actual_on=어제/오늘` (이미 `_on` 패턴 지원)

→ **`SubtestList` 변경 불필요**. 기존 `_to` / `_on` 처리 그대로 활용.

### Progress 컬럼
분자는 **어제까지 누계 actual**로 변경 (그룹의 진척도 = 어제까지 완료된 비율).

### 정렬 기본
T2 누계 Δ (어제까지) 가장 음수 순 — 기존과 동일 로직, 데이터 기준만 어제.

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/lib/dashboard-utils.ts` | `PlanActualMetrics`에 `yesterdayPlan`, `yesterdayActual` 필드 추가 + `cumPlan/cumActual` 기준 일자 = `today - 1`로 변경. `aggregatePlanActualByGroup` 시그니처에 `yesterday` 파라미터 추가 |
| `src/pages/DashboardPage.tsx` | `PlanActualTable`에 Yesterday 컬럼 그룹 (3 컬럼 colspan) 추가, 누계 헤더를 "To-Yesterday"로 변경, drill-down URL의 날짜 값을 어제로 변경 |

DB / Edge function / 마이그레이션 변경 없음.

### 모바일 대응
컬럼이 9개(3그룹×3) + Total + Stage + Progress = 12개로 증가 → `overflow-x-auto` 유지, 셀 패딩 축소 (`px-2 py-1.5`).

