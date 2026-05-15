## 현재 상태 리뷰 (이미 구현된 부분)

지난 작업으로 다음은 이미 반영되어 있습니다. **재작업하지 않습니다**.

- `DocModule` 에 `'spare_part'` 추가, `MODULE_LABEL` / `MODULE_RAW_ROUTE` / `MODULES` 갱신
- `buildSparePartStageRecords` (5단계: Confirm → Direction → PO → ETA → Delivered) 및 `computeDataQualityIssues` 의 spare_part 케이스
- `loadExecutiveDashboard` 가 `docs_spare_part` 를 paginated `fetchAll` 로 로드, `sparePartRows` 스냅샷 노출
- `DocsExecutiveDashboardPage`: Spare Parts 모듈 카드 / 스테이지 진행 / Data Quality 통합
- `DocsSparePartRawDataPage`: `stage / status / po_status / overdue / po_pending / eta_missing / delivery_pending / missing_subcontractor / missing_hdec_pic / subcontractor / hdec_pic / team / trade / asOf` 쿼리 필터
- `PunchDashboardPage`: 14개+ KPI 카드, Weighted/Simple Progress, Schedule Control, Pre-Engineering Readiness, 7/14-Day Lookahead, Progress Matrix, Recovery Priority 리스트
- `PunchRawDataPage`: `status / health / due / start_delayed / pre_eng / blocker / ready_not_started / lookahead` 쿼리 필터
- `punch-dashboard-utils.ts`: weighted progress, blocker classification, recovery priority score

## 남은 갭 (이번 작업 범위)

스펙과 코드를 비교해 누락된 부분만 보강합니다.

### A. Document — Spare Parts
1. **`po_overdue` 필터 추가**
   - `docs-dashboard-filter.ts` `DashboardFilterParams` 에 `po_overdue` 추가, 정의: `!actual_po_date && planned_po_date < asOf`
   - `DocsSparePartRawDataPage` 의 URL 파라미터 처리에 `po_overdue=true` 추가
2. **Executive Dashboard Spare Parts KPI 카드 보강**
   - `PO Pending`, `PO Overdue`, `ETA Missing`, `Missing Subcontractor`, `Missing HDEC PIC` 버킷 카드가 모두 클릭 → 위 URL로 드릴다운되는지 확인 및 누락분 추가
3. **Spare Parts 상태 분포 (Stock Status / PO Status Distribution)**
   - 모듈 카드 하단에 status / po_status 카운트 미니 분포 추가 (클릭 시 `?status=` / `?po_status=` 드릴다운)

### B. Punch — Daily Recovery Control

1. **Today's Recovery Priority Items 테이블 보강**
   - 컬럼 보강: `Item No / Outstanding Works / Location / Team / Main Trade / Subcontractor / HDEC PIC / Planned Completion / Planned % / Actual % / Variance % / Health / Blocker / Days Overdue / Suggested Recovery Action`
   - **신규** `suggestedRecoveryAction(row)` 헬퍼를 `punch-dashboard-utils.ts` 에 추가 (스펙의 룰 기반 매핑)
   - 정렬 우선순위: Critical → days overdue desc → blocked → due date asc → weight desc → variance asc
2. **Punch Data Quality 패널 (신규 섹션, 하단)**
   - 버킷: missing_planned_start / missing_planned_completion / missing_hdec_pic / missing_subcontractor / missing_team / completed_missing_actual_completion / invalid_progress (>100 or <0) / invalid_dates (planned_completion < planned_start, actual_completion < actual_start) / missing_weight / missing_health
   - 각 버킷 클릭 → `/punch/raw-data?dq=<key>`
   - `PunchRawDataPage` 에서 `dq` 파라미터 처리 추가
3. **Daily Meeting Action View (신규 컴팩트 섹션, 상단 근처)**
   - 좌측: Today's Recovery Priority (top 10) / Due This Week count / Blocked count / Ready but Not Started count
   - 우측: Top Delaying Subcontractors (top 5, overdue+critical count desc) / Top Responsible HDEC PICs (top 5)
   - 모든 항목 클릭 → 필터링된 raw-data 링크

## 변경 파일

- `src/lib/docs-dashboard-filter.ts` — `po_overdue` 키 추가
- `src/pages/docs/DocsSparePartRawDataPage.tsx` — `po_overdue` URL 처리
- `src/pages/docs/DocsExecutiveDashboardPage.tsx` — Spare Parts KPI/분포 카드 누락분 보강
- `src/lib/punch-dashboard-utils.ts` — `suggestedRecoveryAction`, data-quality 헬퍼
- `src/pages/PunchDashboardPage.tsx` — Recovery Priority 컬럼 확장, Daily Meeting Action View, Data Quality 패널
- `src/pages/PunchRawDataPage.tsx` — `dq=` 필터 처리

## 비변경 보장

- `punch-field-registry.ts` (import/export SSOT) **수정하지 않음**
- Supabase 스키마 / 마이그레이션 **변경 없음**
- 기존 detail/import/export 페이지 및 cache 유틸 미수정
- 모든 UI 라벨 영어 유지

## 검증

`tsc --noEmit` 자동 빌드로 타입 통과 확인 후, KPI/패널의 URL 드릴다운이 raw-data 페이지 필터와 일치하는지 수동 점검.
