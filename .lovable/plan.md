## 목표
`DefectProgressPage`를 T&C `SchedulePage`(/tc/progress) UI 구조로 전면 재디자인합니다. Defect 데이터 모델(3단계 lifecycle: Start/Completion/Closure)에 맞게 Stage를 매핑하고, T&C Progress의 toolbar / KPI strip / matrix / risk panel / date lookup / hide-past / excel export 패턴을 그대로 가져옵니다.

## 결정사항 (사용자 확정)
- **Stage 구성**: Start / Completion / Closure (3 stages)
- **Group By**: 기존 8개 + HDEC ENG = 9개 (Team, Subcontractor, Sub-Sub, HDEC PIC, **HDEC ENG**, Level, Main Trade, Sub Trade, Work Type)
- **포함 기능**: 핵심 UI 세트 + Risk Panel + Hide past + Date Lookup + Excel export
- **기존 차트(Daily/Cumulative)**: 제거 — matrix 중심 통일

---

## UI 구조 (T&C Progress와 동일)

```text
┌─ Header ─────────────────────────────────────────────────┐
│ 📅 Defect Progress Status              [Excel] [Risk]   │
│ Track planned vs actual by {group} · {bucket} · …       │
├─ Toolbar (Card) ─────────────────────────────────────────┤
│ Group | Team | Bucket | Stage | As-of | Range | Lookup  │
│   tabs  select  tabs   toggle   tabs   select  pop+Go   │
│                                              [Legend]    │
├─ KPI Strip (4 cards) ────────────────────────────────────┤
│ Cumulative │ Delay up to │ Critical │ Upcoming 7d Plan  │
│  Progress  │  Data Date  │  (≤7d)   │                   │
├─ Action row ─────────────────────────────────────────────┤
│                              [Hide past] [Risk Panel]    │
├─ Main ───────────────────────────────────────────────────┤
│ ┌─ DefectScheduleMatrix ──────┐ ┌─ Critical Watchlist ─┐│
│ │ Group │ Stage │ buckets...  │ │ High risk            ││
│ │ ...                         │ │ Bottleneck           ││
│ │                             │ │ Lagging groups       ││
│ └─────────────────────────────┘ └──────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

## Stage 매핑 (Defect lifecycle 기반)

| Stage key | Planned date field            | Actual date field             | Done 판정                        |
|-----------|--------------------------------|--------------------------------|----------------------------------|
| `start`   | `planned_start_date`           | `actual_start_date`            | actual_start_date 존재 OR 후속 stage done |
| `completion` | `planned_completion_date`   | `actual_completion_date`       | actual_completion_date 존재 OR closure done OR `actual_progress_pct >= 100` |
| `closure` | `planned_closure_date`         | `actual_closure_date`          | `isClosedDefect()` (기존 함수)    |

Cascade Done semantics 유지: closure done ⇒ completion/start done; completion done ⇒ start done.

## Group By 옵션 (9개)

| key                  | label             | accessor                |
|----------------------|-------------------|-------------------------|
| `team`               | Team              | `team` (TEAM_LABELS)    |
| `subcontractor_name` | Subcontractor     | `subcontractor_name`    |
| `subsub_name`        | Sub-Sub           | `subsub_name`           |
| `hdec_pic_name`      | HDEC PIC          | `hdec_pic_name`         |
| `hdec_eng_name`      | **HDEC ENG (신규)** | `hdec_eng_name`         |
| `area_level`         | Level             | `area_level`            |
| `main_trade`         | Main Trade        | `main_trade`            |
| `sub_trade`          | Sub Trade         | `sub_trade`             |
| `work_type`          | Work Type         | `work_type`             |

---

## 구현 작업

### 1. 신규 라이브러리: `src/lib/defect-schedule-utils.ts`
T&C `schedule-utils.ts`를 Defect 모델로 포팅. 포함 함수:
- 타입: `DefectScheduleStage = 'start' | 'completion' | 'closure'`, `DefectScheduleStageFilter`, `DefectScheduleBucket`, `DefectScheduleGroupBy`, `BucketCell`, `StageRow`, `GroupRow`, `CriticalItem`, `LaggingGroup`
- `DEFECT_STAGE_KEYS`, `getDefectStagePlannedDate`, `getDefectStageActualDate`, `isDefectStageDone(item, stage)`, `isDefectStagePlannedUpTo`, `isDefectStageActualUpTo`, `isDefectStagePlannedOn`, `isDefectStageDelayedAsOf`
- `aggregateDefectSchedule({ items, groupBy, bucket, stageFilter, rangeStart, rangeEnd, asOfDate })`
- `findDefectCritical(items, today, daysLeft, groupBy)` → high-risk + bottleneck (closure not started but completion overdue)
- `findDefectLaggingGroups(rows, threshold)`
- `addDays`, `toIso` (T&C와 동일하게 재export)

### 2. 신규 컴포넌트: `src/components/defects/DefectScheduleMatrix.tsx`
T&C `ScheduleMatrix.tsx` 패턴 그대로. Stage 토글 시 `start/completion/closure` 서브로우로 전개. Cell 클릭 → `/defects/raw-data?{group}={value}&date_from=…&date_to=…&date_field=planned|actual&stage=start|completion|closure&cell_status=Done(actual인 경우)` 형식으로 navigate.

### 3. 신규 컴포넌트: `src/components/defects/DefectCriticalWatchlist.tsx`
T&C `CriticalWatchlist`와 동일 레이아웃. 3개 섹션:
- **High Risk**: 7일 내 planned date인데 not done (모든 stage 대상)
- **Completion Bottleneck**: completion overdue & not done인 defect (T&C의 T1 bottleneck 자리)
- **Lagging Groups**: cumActual / cumPlan < 임계치

### 4. 신규 라이브러리: `src/lib/defect-schedule-excel-export.ts`
T&C `schedule-excel-export.ts` 포팅. `exportDefectScheduleToExcel(visibleData, { groupHeader, stageFilter, bucket, today, dataDate, asOfLabel })` — XLSX 형식, 그룹별 Plan/Actual 행 + bucket 컬럼.

### 5. 페이지 재작성: `src/pages/DefectProgressPage.tsx`
기존 코드 전면 교체. T&C `SchedulePage` 골격 그대로 가져와서 다음으로 치환:
- `subtests` → `defect_items` 로딩 (기존 페이지의 paged fetch 패턴 사용)
- `system_master` 조회 제거 (Defect엔 system 그룹이 없음)
- `useLatestDataDate` 훅으로 Data Date 가져오기 (기존 페이지에서 이미 사용 중)
- URL 파라미터 동기화: `group`, `bucket`, `stage_view`, `asof_mode`, `team`, `range`, `hide_past`, `risk_panel`, `picked`, `picked_field`
- Hide past localStorage key: `defect_schedule_hide_past`
- Cache: 별도 `defect-schedule-cache` (선택 — T&C와 동일하게 instant render 위해)
- KPI Strip 4종:
  - Cumulative Progress: 선택된 stage의 done/total
  - Delay Up to Data Date: stage delayed 합산
  - Critical (≤7d): 7일내 planned & not done
  - Upcoming 7d Plan: 향후 7일 planned 합산
- Toolbar: Group(9개) / Team / Bucket(day,week) / Stage(All + start/completion/closure 토글) / As-of(Data Date / Today) / Range(14/30/60/90) / Lookup(date picker + plan/actual + Go)
- Excel 버튼은 헤더 우측

### 6. Raw Data 라우팅 호환성 검증
새로운 query 파라미터들(`stage=start|completion|closure`, `date_field`, `cell_status`)이 `DefectRawDataPage`에서 처리되는지 확인. 누락 시 필터 핸들러 추가.

---

## 영향 범위

### 신규 파일
- `src/lib/defect-schedule-utils.ts`
- `src/lib/defect-schedule-excel-export.ts`
- `src/components/defects/DefectScheduleMatrix.tsx`
- `src/components/defects/DefectCriticalWatchlist.tsx`

### 수정 파일
- `src/pages/DefectProgressPage.tsx` — 전면 재작성
- `src/pages/DefectRawDataPage.tsx` — 신규 query 파라미터 핸들링 (필요 시)

### 제거 (사용처 정리 후)
- `src/components/defects/DefectProgressMatrix.tsx` (DefectScheduleMatrix로 대체)
- `src/components/defects/DefectDailyCumulativeChart.tsx` (차트 제거 결정)
- `src/lib/defect-progress-utils.ts` (defect-schedule-utils로 대체) — 단, 다른 곳에서 import 중이면 deprecated로 두고 progress 페이지에서만 끊기

### 보존
- `defect-dashboard-utils.ts` (Dashboard에서 계속 사용)
- `useLatestDataDate` 훅 (Data Date 출처)
- 기존 stage Done 판정 로직(`isClosedDefect`, `isOverdueDefect`)은 새 utils에서 재사용

---

## 비고
- T&C `stage-metrics.ts`는 subtest 전용이므로 Defect용 로직은 새 `defect-schedule-utils.ts`에 inline으로 작성합니다.
- Critical Watchlist의 "T1 Bottleneck" 의미는 Defect에서 "Completion overdue but not closed" 로 재정의합니다 (closure 직전 단계 적체).
- Defect엔 system 그룹이 없으므로 systemFilter UI는 matrix에서 제거합니다.
- 색상 토큰(`schedule-plan`, `schedule-actual`, `schedule-over`, `schedule-short`)은 기존 design system 그대로 사용합니다.
