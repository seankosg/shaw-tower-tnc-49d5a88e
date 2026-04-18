

## Plan vs Actual Breakdown 표 재구성 — Predecessor / T1 / T2 분리

### 변경 컨셉
각 그룹마다 **3개 sub-row (Predecessor / T1 / T2)**로 분리하여 누계·당일 Plan/Actual/Δ를 명확히 표시. 첫 컬럼 헤더는 **System** (System 탭) / **Subcontractor** / **Sub-Sub** / **HDEC PIC** — 탭별 그룹명 사용 ("Group" 명칭 제거).

### Predecessor 정의 (옵션 1 채택 가정)
DB 변경 없이: **Predecessor Actual = T1이 WIP 또는 Done인 subtest 수**, **Predecessor Plan = T1 planned_date ≤ 오늘인 수**. (T1 시작 = Predecessor 완료로 간주)

> 다른 옵션을 원하시면 말씀해 주세요.

### 표 구조

```
┌──────────┬───────┬──────┬──────────────────┬───────────────┬──────────┐
│ System   │ Total │Stage │  To-Date 누계    │  Today 당일   │ Progress │
│          │       │      │ Plan│Actual│ Δ  │Plan│Actual│ Δ │          │
├──────────┼───────┼──────┼─────┼──────┼────┼────┼──────┼───┼──────────┤
│ SYS-001  │  50   │ Pred │ 45  │  40  │ -5 │  2 │  1   │-1 │ ███░ 80% │
│ rowspan=3│       │ T1   │ 40  │  35  │ -5 │  3 │  2   │-1 │ ██░░ 70% │
│          │       │ T2   │ 30  │  20  │-10 │  2 │  0   │-2 │ █░░░ 40% │
├──────────┼───────┼──────┴─────┴──────┴────┴────┴──────┴───┴──────────┤
│ SYS-002  │ ...                                                        │
```

- 첫 컬럼 헤더는 탭별로 변경: **System** / **Subcontractor** / **Sub-Sub** / **HDEC PIC**
- **Stage 배지**: Pred(회색) / T1(파랑) / T2(보라)
- **Δ 컬러**: 음수=빨강, 0=회색, 양수=초록
- **Progress**: stage별 단일 bar (`cumActual / totalSubtests`) + %
- 그룹 사이 `border-t-2`로 구분 강화
- 정렬 기본: T2 누계 Δ 가장 음수 순

### 셀 클릭 Drill-down
| 셀 | URL |
|---|---|
| 첫 컬럼 이름 | `?<group>=...` |
| T1/T2 누계 Plan | `?<group>=...&t{n}_planned_to=오늘` |
| T1/T2 누계 Actual | `?<group>=...&t{n}_actual_to=오늘` |
| T1/T2 당일 Plan | `?<group>=...&t{n}_planned_on=오늘` |
| T1/T2 당일 Actual | `?<group>=...&t{n}_actual_on=오늘` |
| Pred 누계 Actual | `?<group>=...&t1_status=WIP,Done` |
| Pred 누계 Plan | `?<group>=...&t1_planned_to=오늘` |

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/lib/dashboard-utils.ts` | `PlanActualRow`에 `predecessor` 메트릭 추가 (T1 status 기반 계산) |
| `src/pages/DashboardPage.tsx` | `PlanActualTable` 재구성: rowspan 3-stage, 첫 컬럼 헤더 prop화 (System/Subcon/Sub-Sub/HDEC PIC) |

DB / Edge function 변경 없음.

