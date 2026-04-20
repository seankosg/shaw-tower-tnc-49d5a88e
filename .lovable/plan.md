

## Schedule Page (A+D) — 최종 구현 계획

### 컨셉
Plan vs Actual Breakdown의 시간축 확장. System(기본) / Subcon / SubSub 그룹화 + Day(기본) / Week 토글. 각 셀에 Plan(회색) vs Actual(파랑/초과 초록/미달 빨강) 미니 바차트. 시스템 행 펼침 시 Pred/T1/T2 sub-row 분리. 우측 Critical Watchlist.

### 화면 구성

**Toolbar**
- Group: `[System▾] [Subcon] [SubSub]`
- Bucket: `[Day▾] [Week]`
- Stage: `[All▾] [Pred] [T1] [T2]`
- Range: `[60d▾]` (30/60/90/All)
- Today indicator + Export

**KPI Strip** (6개)
Today Plan / Today Actual / Cum Plan / Cum Actual / Variance% / Critical(≤7d) + Overdue

**Schedule Matrix** (좌 sticky 4열 + 우 horizontal scroll)
- Sticky 좌: Group | Done/Total | Cum Plan | Cum Actual
- 우: 일자/주차 셀 (각 ~70/110px)
- Stage `All`일 때: 시스템 행 펼침(▶) → Pred/T1/T2 3개 sub-row
- Stage 단일 선택 시: sub-row 없이 해당 stage만

**Critical Watchlist (우측 320px)**
1. High Risk: T2 plan ≤ 7d & not Done
2. T1 Bottleneck: T1 미완료 + T2 plan ≤ 7d
3. Lagging Groups: cum_actual/cum_plan 비율 하위 5

### 셀 디자인 (확정 색상)

| 상태 | 시각 |
|---|---|
| Plan 배경 | `bg-gray-300` |
| Actual ≤ Plan | 파랑 `bg-blue-600` |
| Actual > Plan (초과 부분만) | 초록 `bg-green-600` |
| Delta 음수 | `text-red-600` (예: `-2`) |
| Delta 양수 | `text-green-600` (예: `+3`) |
| Today 컬럼 | `border-l-2 border-primary` |
| 미래 셀 | Plan만 (Actual 없음) |

```text
정상:    ███▓▓░░    초과:    ██████▓▓   미래:   ░░░░
         3 / 5               5 / 3              — / 4
         -2 (red)            +2 (green)
```

### 데이터 로직 (`src/lib/schedule-utils.ts` 신규)
- 모든 active subtests 로드 (Dashboard 방식 재사용)
- Stage별 (group_key, date_bucket)에 plan/actual 집계
  - Pred: `predecessor_status_raw` 완료 일자 추정 (T1 시작 ≥ 1일 전 or done 키워드)
  - T1: `t1_planned_date` (plan), `t1_actual_date` (actual, status=Done)
  - T2: `t2_planned_date` (plan), `t2_actual_date` (actual, status=Done)
- Cum 누적: bucket 정렬 후 sequential sum
- Critical: 오늘+7일 이내 plan & not Done

### 변경 파일

| 파일 | 역할 |
|---|---|
| `src/pages/SchedulePage.tsx` | 메인 페이지 (Toolbar + KPI + Matrix + Watchlist) |
| `src/components/schedule/ScheduleMatrix.tsx` | sticky-left + h-scroll 매트릭스, 행 펼침 |
| `src/components/schedule/ScheduleCell.tsx` | 미니 바차트 셀 |
| `src/components/schedule/CriticalWatchlist.tsx` | 우측 알림 패널 |
| `src/lib/schedule-utils.ts` | 집계·bucket·critical 로직 |
| `src/App.tsx` | `/schedule` 라우트 |
| `src/components/layout/AppSidebar.tsx` | "Schedule" 메뉴 (Calendar 아이콘) |

### 변경 없음
DB / RLS / Edge Functions / DashboardPage / SubtestList

### 검증
1. Group 토글 → System/Subcon/SubSub 즉시 전환
2. Day↔Week 토글 → bucket 자동 재집계
3. 시스템 행 펼침 → Pred/T1/T2 sub-row, 합계 일치
4. Stage `T1` 선택 → T1만 단일 행 표시
5. 셀 클릭 → SubtestList 필터 진입 (group + date + stage)
6. Critical 항목 클릭 → 해당 필터로 SubtestList 진입
7. 오늘 컬럼 강조 + 미래 셀 Plan만 표시
8. 초과달성/미달 색상 정확히 분기

