# 검토 결과 및 계획

요청 내용을 현재 코드베이스와 대조해 검토한 결과, **요청 자체에 충돌은 없고 그대로 진행 가능**합니다. 다만 몇 가지 확인 사항이 있습니다.

## 검토 시 발견한 사항

1. **`docs-stage-records.ts`의 `DocModule` 유니온 확장 영향 범위가 큼** — `DocModule = 'abd' | 'omm' | 'warranty'`가 `ALL_STAGE_DEFS`, `MODULE_LABEL`, `MODULE_RAW_ROUTE`, `computeDataQualityIssues` 등에서 Record로 사용되어, `'spare_part'` 추가 시 모든 Record에 항목을 채워야 컴파일됩니다. (큰 문제는 아니고 일괄 추가)
2. **Spare Part의 "current stage" 개념이 ABD/OMM/Warranty와 다름** — Spare Part는 단계가 순차적이고 마지막 도달 단계만 "current"로 보는 게 자연스러움. 기존 `procurementProgressLevel` 헬퍼를 그대로 사용해 stage_order로 매핑하는 방식이 맞음.
3. **Spare Part는 "planned date"가 누락되는 단계가 많음** (Direction/ETA 등) — 요청대로 "planned 없으면 overdue 아님"으로 처리. 기존 `isOverdueSparePart`는 delivery만 본다는 점을 인지하고, 단계별 overdue는 stage 정의 안에서 별도 계산 필요.
4. **Punch `weight` 필드는 `punch-field-registry.ts`에 이미 존재** — 가중 진척 계산 가능. `progress_variance_pct`, `health_status`도 이미 있음.
5. **PunchDashboardPage(281줄)는 비교적 단순** — 기존 구조 유지하며 섹션 추가로 확장 가능. 컴포넌트 분리 필요(파일이 600줄 넘기지 않게).
6. **Punch 진척 자동 재계산** — `progress_variance_pct`, `health_status`가 import 시 채워진다고 가정. 대시보드에서는 fallback 계산만 보강.
7. **Import/Export 레지스트리 변경 없음** — Part B-9 요구대로 `punch-field-registry.ts` 손대지 않음.
8. **App UI는 영문 유지** (메모리 Core 규칙과 일치).

## Part A — Document Dashboard에 Spare Part 추가

### A1. `src/lib/docs-stage-records.ts`
- `DocModule`에 `'spare_part'` 추가
- `MODULE_LABEL.spare_part = 'Spare Parts'`, `MODULE_RAW_ROUTE.spare_part = '/docs/spare-part'`
- `SPARE_PART_STAGE_DEFS` 추가 (5단계: confirm / direction / po / eta / delivered) — key, label, planned_field, actual_field, done predicate
- `ALL_STAGE_DEFS.spare_part = SPARE_PART_STAGE_DEFS`
- `buildSparePartStageRecords(rows, asOf)` 신규 — 행당 5개 stage record 생성, current_stage는 `procurementProgressLabel` 사용, planned 없으면 `is_overdue=false`
- `computeDataQualityIssues`의 module Record에 `spare_part` 케이스 추가 (missing planned/actual/subcon/PIC, inconsistent — 단계 역행 검사)

### A2. `src/lib/docs-executive-dashboard-data.ts`
- `docs_spare_part` 4번째 `fetchAll` 추가 (필요 컬럼만 select, 기존 페이지네이션 패턴 유지)
- `ExecDashboardSnapshot`에 `sparePartRows` 추가
- `records`에 `buildSparePartStageRecords(...)` 결과 합치기

### A3. `src/lib/docs-dashboard-filter.ts`
- `po_pending`, `eta_missing`, `delivery_pending`, `po_status` 키 추가
- 필터 분기 추가, `DocModule`에 spare_part 포함되도록 확장

### A4. `src/pages/docs/DocsExecutiveDashboardPage.tsx`
- Portfolio KPI strip의 분모에 spare part도 포함
- Spare Parts 모듈 섹션 신규 (KPI 6장 + Procurement Buckets):
  - Total / Delivered / Remaining / Overdue Delivery / PO Pending / ETA Missing
  - Status 분포 바 (Short / Pending / Ordered / Stock) — `normalizeSparePartStatus` 사용
  - 5단계 progress (StageCard 재사용)
  - Subcontractor / HDEC PIC 드롭다운 필터
  - 각 카드 클릭 → `/docs/spare-part?...` 드릴다운
- Data Quality 패널에 spare_part 항목도 자동 노출

### A5. `src/pages/docs/DocsSparePartRawDataPage.tsx`
- 기존 `searchParams` 처리 확장: `stage`, `status`, `po_status`, `hdec_pic`, `team`, `trade`, `eta_missing`, `po_pending`, `delivery_pending`
- 기존 overdue/asOf/subcontractor 로직과 합쳐 useMemo 한 곳에서 적용
- DOCS_DRILLDOWN_PARAMS 패턴이 있다면 동일하게 정의

## Part B — Punch Dashboard 진척 통제 강화

`PunchDashboardPage.tsx`를 섹션 컴포넌트로 분할하면서 확장. 파일이 커지면 `src/components/punch/` 하위로 분리.

### B1. 신규 헬퍼 `src/lib/punch-dashboard-utils.ts`
- `isStartDelayed`, `isCompletionOverdue`, `isDueThisWeek`, `isCriticalDelay`, `isBehindSchedule`, `isBlockedByPreEng`, `daysOverdue`
- `weightedProgress(rows)` → `{ planned, actual, variance, hasWeight }`
- `groupProgressMatrix(rows, keyFn)` → 행별 집계 (Total/Completed/Remaining/WIP/NotStarted/Overdue/Critical/Blocked/Completion%/WPlanned/WActual/Variance)
- `dominantBlocker(row)` → 'material_approval' | 'material_procurement' | 'drawing_approval' | 'mos_approval' | 'multiple' | null
- `recoveryPriorityScore(row)` → 정렬용 점수

### B2. `src/pages/PunchDashboardPage.tsx`
**기존 KPI 4장을 14장 그리드로 확장** (모두 클릭 시 `/punch/raw-data?...`):
- Total, Completed, Remaining, WIP, Not Started, Overdue, Critical, Behind, Blocked, Due This Week
- Completion %, Weighted Planned %, Weighted Actual %, Variance %

**Progress Overview 카드**: Weighted를 메인으로, Simple Average를 보조 표시. Variance도 둘 다.

**신규 섹션들**:
- **Schedule Control**: Start Delayed / Completion Overdue / Due This Week / Critical Delay (각 클릭형)
- **Pre-Engineering Readiness Panel**: Material Approval Pending, Material Procurement Pending, Drawing Approval Pending, MOS Approval Pending, Multiple Blockers, Ready but Not Started — 각 `?blocker=...` 드릴다운
- **Lookahead Panel (7d / 14d 탭)**: Due in 7d, Due in 14d, Planned to Start This Week, Planned to Complete This Week, Should Have Started, WIP Due Soon
- **Progress Matrix**: Group by 셀렉터 (Team / Main Trade / Subcontractor / HDEC PIC), 정렬 가능 (Overdue desc / Critical desc / Variance asc / Remaining desc), 컬럼: Total/Completed/Remaining/WIP/NotStarted/Overdue/Critical/Blocked/Completion%/WPlanned/WActual/Variance
- **Recovery Priority Items 테이블**: 상위 N개 (Critical | overdue>14d | blocked | high weight & behind | due 7d & actual<planned)

### B3. `src/pages/PunchRawDataPage.tsx`
- searchParams 드릴다운 자동 적용 추가:
  - `status` (completed/wip/not_started/overdue), `health` (critical/behind), `pre_eng=blocked`, `due` (this_week/next_14_days), `team`, `main_trade`, `subcontractor`, `hdec_pic`, `blocker` (material_approval/material_procurement/drawing_approval/mos_approval)
- 진입 시 필터 상태에 반영하고 배너 표시 (기존 패턴 따름)

### B4. 디자인 / 영향 범위
- 디자인 시스템 그대로 사용, 영문 라벨 유지
- 기존 `ScheduleMatrix`, `KpiCard`, `Progress`, `Card` 재사용
- import/export 레지스트리 변경 없음
- T&C / Defect / 기존 Docs 모듈 로직 변경 없음

## 산출물
- 수정: `docs-stage-records.ts`, `docs-executive-dashboard-data.ts`, `docs-dashboard-filter.ts`, `DocsExecutiveDashboardPage.tsx`, `DocsSparePartRawDataPage.tsx`, `PunchDashboardPage.tsx`, `PunchRawDataPage.tsx`
- 신규: `src/lib/punch-dashboard-utils.ts` (+ 필요 시 `src/components/punch/` 하위 섹션 컴포넌트들)
