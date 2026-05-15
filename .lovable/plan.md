
# Punch (Minor O/S Work) Management 모듈 추가 계획

기존 Defect / Docs 모듈과 동일한 아키텍처(테이블 + RLS + Import/Export + Raw Data + Dashboard)를 따라 신설합니다. 업로드 파일의 컬럼은 모두 보존하고, 공정관리/Pre-Engineering 게이트용 필드를 추가합니다. **Export → Import 라운드트립이 매핑 누락 없이 동작하도록 헤더 매핑을 사전 정의합니다.**

## 1. 사이드바 / 라우팅

신규 섹션 `Punch` 추가:
- `/punch/dashboard` — Dashboard
- `/punch/raw-data` — Raw Data 그리드
- `/punch/:id` — Detail
- `/punch/import` + `/punch/import/logs` — Import + History
- `/punch/export` — Export
- `/punch/quick-update` — (Phase 2) 모바일 빠른 업데이트

ModuleStatusContext에 `punch` 키 추가 → Admin > Module Control에서 활성/일시정지 가능.

## 2. 데이터 모델 (신규 테이블)

### `punch_items` — 핵심 작업 단위 (1행 = 1 O/S Work)

업로드 파일(보존):
- `item_no` (text, 그룹핑용 — 같은 번호가 여러 행 가능)
- `category1` (구분1), `category2` (구분2), `category3` (구분3)
- `critical_level` (text: 상/중상/중/중하/하)
- `subcontractor_name`, `subsub_name`, `hdec_pic_name`, `hdec_eng_name`
- `outstanding_work` (text, 작업명 / 핵심 식별자)
- `level`, `location`
- `team`, `main_trade`, `sub_trade`
- `work_type` (Late confirmed / Outstanding / Replacement …)
- `planned_start_date`, `planned_completion_date`
- `actual_start_date`, `actual_completion_date`
- `actual_progress_pct` (numeric 0–100)
- `completion_status` (Not Started / In Progress / Completed / On Hold)
- `remarks`

신규 (공정관리):
- `planned_progress_pct` — `data_date` 기준 일자별 linear 계산 (defect의 `computePlannedProgressPct` 재사용)
- `progress_variance_pct` — `actual − planned`
- `data_date` — 진행률 평가 기준일 (전역 dataDate)
- `health_status` — Ahead / On Track / Behind / Critical
- `weight` — S-curve 가중치 (기본 1)

신규 (Pre-Engineering 게이트 4종):
- `material_approval_status` (enum: not_required / pending / approved) + `material_approval_date`
- `material_procurement_status` (enum: not_required / pending / partially_secured / secured) + `material_procurement_date`
- `drawing_approval_status` (enum: not_required / pending / approved) + `drawing_approval_date`
- `mos_approval_status` (enum: not_required / pending / approved) + `mos_approval_date`
- `pre_engineering_ready` (boolean, 트리거 자동) + `pre_engineering_blockers` (text[])

표준 메타:
- `id`, `project_id`, `is_active`, `row_version`, `data_source_type`, `source_upload_id`, `custom_payload` (jsonb), `created_at`, `updated_at`, `updated_by`

### 보조 테이블
- `punch_upload_batches` — defect_upload_batches와 동일 구조 (status는 실패 시 'failed'로 업데이트)
- `punch_change_log` — 필드 변경 이력
- `punch_comments` + `punch_comment_reads`
- `punch_daily_snapshots` — 매일 progress 스냅샷 (S-curve용)

### RLS
Defect/Subtest와 동일 패턴 (`get_punch_edit_scope`, `can_update_punch`, `validate_punch_responsibility_update`, `delete_punch_cascade` 등 함수 신설). Pre-Engineering 게이트는 hdec PIC/superuser만 변경 가능.

## 3. Header Mapping & Export ↔ Import 라운드트립 (핵심)

### 3-1. 매핑 단일 진실 소스
`src/lib/punch-field-registry.ts` 신설 — 모든 punch 필드 메타를 한 곳에 정의:

```ts
export const PUNCH_FIELDS = [
  { field: 'item_no',                  exportLabel: 'Item No',                aliases: ['item no', 'item_no', 'no', '번호'] },
  { field: 'category1',                exportLabel: '구분1',                  aliases: ['구분1', 'category 1', 'cat1'] },
  { field: 'category2',                exportLabel: '구분2',                  aliases: ['구분2', 'category 2'] },
  { field: 'category3',                exportLabel: '구분3',                  aliases: ['구분3', 'category 3'] },
  { field: 'critical_level',           exportLabel: 'Critical Level',         aliases: ['critical level', 'criticality', '중요도'] },
  { field: 'subcontractor_name',       exportLabel: 'Subcontractor',          aliases: ['subcontractor', 'sub', 'sub-contractor'] },
  { field: 'outstanding_work',         exportLabel: 'Outstanding Works',      aliases: ['outstanding works', 'outsanding works', 'outstanding work', 'work', 'description'] }, // 원본 오타 'Outsanding' 포함
  { field: 'level',                    exportLabel: 'Level',                  aliases: ['level', 'floor'] },
  { field: 'location',                 exportLabel: 'Location',               aliases: ['location', 'area'] },
  { field: 'team',                     exportLabel: 'Team',                   aliases: ['team'] },
  { field: 'main_trade',               exportLabel: 'Main Trade',             aliases: ['main trade', 'trade'] },
  { field: 'sub_trade',                exportLabel: 'Sub Trade',              aliases: ['sub trade'] },
  { field: 'subsub_name',              exportLabel: 'Sub-Sub',                aliases: ['sub-sub', 'subsub', 'sub sub'] },
  { field: 'hdec_pic_name',            exportLabel: 'HDEC PIC',               aliases: ['hdec pic', 'pic', 'hdec_pic'] },
  { field: 'hdec_eng_name',            exportLabel: 'HDEC Eng',               aliases: ['hdec eng', 'engineer', 'hdec engineer'] },
  { field: 'work_type',                exportLabel: 'Work Type',              aliases: ['work type', 'type'] },
  { field: 'planned_start_date',       exportLabel: 'Planned Start Date',     aliases: ['planned start date', 'plan start', 'planned start'] },
  { field: 'planned_completion_date',  exportLabel: 'Planned Completion Date',aliases: ['planned completion date', 'plan completion', 'planned completion', 'planned finish'] },
  { field: 'actual_start_date',        exportLabel: 'Actual Start Date',      aliases: ['actual start date', 'actual start'] },
  { field: 'actual_completion_date',   exportLabel: 'Actual Completion Date', aliases: ['actual completion date', 'actual completion', 'actual finish'] },
  { field: 'actual_progress_pct',      exportLabel: 'Actual Progress %',      aliases: ['actual progress %', 'actual progress', 'progress'] },
  { field: 'planned_progress_pct',     exportLabel: 'Planned Progress %',     aliases: ['planned progress %', 'planned progress'] },
  { field: 'progress_variance_pct',    exportLabel: 'Variance %',             aliases: ['variance %', 'variance', 'gap'], readOnly: true }, // import 시 무시
  { field: 'health_status',            exportLabel: 'Health',                 aliases: ['health', 'health status'], readOnly: true },
  { field: 'completion_status',        exportLabel: 'Completion Status',      aliases: ['completion status', 'status'] },
  { field: 'material_approval_status', exportLabel: 'Material Approval',      aliases: ['material approval', 'material approval status'] },
  { field: 'material_approval_date',   exportLabel: 'Material Approval Date', aliases: ['material approval date'] },
  { field: 'material_procurement_status', exportLabel: 'Material Procurement', aliases: ['material procurement', 'material secured', 'procurement'] },
  { field: 'material_procurement_date',   exportLabel: 'Material Procurement Date', aliases: ['material procurement date', 'procurement date'] },
  { field: 'drawing_approval_status',  exportLabel: 'Drawing Approval',       aliases: ['drawing approval', '도면승인'] },
  { field: 'drawing_approval_date',    exportLabel: 'Drawing Approval Date',  aliases: ['drawing approval date'] },
  { field: 'mos_approval_status',      exportLabel: 'MOS Approval',           aliases: ['mos approval', 'mos approval status'] },
  { field: 'mos_approval_date',        exportLabel: 'MOS Approval Date',      aliases: ['mos approval date'] },
  { field: 'pre_engineering_ready',    exportLabel: 'Pre-Eng Ready',          aliases: ['pre-eng ready', 'pre engineering ready'], readOnly: true },
  { field: 'remarks',                  exportLabel: 'Remarks',                aliases: ['remarks', 'remark', 'note', 'notes'] },
];
```

### 3-2. Export 동작
- 컬럼 헤더는 항상 위 `exportLabel` 사용
- ID 컬럼(`id`, `row_version`)을 hidden 또는 별도 시트에 같이 출력 → import 시 안전 upsert에 활용
- Custom field는 `Custom: <fieldName>` 헤더로 출력하고 import 시 동일 규칙으로 역매핑

### 3-3. Import 매핑 로직
1. 헤더 정규화(`normalizePunchHeader`): lowercase + trim + 다중 공백/특수문자 압축
2. `exportLabel`(정규화)과 모든 `aliases` 를 합쳐 lookup map 구성 → 1차 매칭
3. `import_header_mappings` 테이블(module='punch')의 사용자 정의 매핑 → 2차 매칭
4. 그래도 매칭 실패 시 `Custom: xxx` 패턴이면 custom_payload로 저장
5. `readOnly: true` 필드(Variance/Health/Pre-Eng Ready)는 import 시 무시(경고만 표시)
6. ColumnSelectDialog에서 매핑 결과를 표시 — 매핑 실패 헤더는 노란 배지

### 3-4. 라운드트립 자가 검증
`src/test/punch-roundtrip.test.ts`:
- 모든 `PUNCH_FIELDS` 의 `exportLabel` → `mapHeader()` → 동일 `field` 로 역매핑되는지 단위 테스트
- 업로드된 원본 파일(`Outstanding_Works_MECH_FACADE_Archi_External_r4.xlsx`)의 24개 헤더가 모두 매핑되는지 확인
- 새 필드 추가 시 테스트가 자동 보호

### 3-5. 시드 마이그레이션
`import_header_mappings` 에 `module='punch'` 행을 위 registry로부터 일괄 INSERT (Admin > Header Mappings에서 사후 편집 가능).

## 4. Raw Data 페이지
`DefectRawDataPage` 패턴 그대로:
- 컬럼: 전체 + custom field
- 필터: team / trade / sub / status / critical_level / health_status / pre_eng_ready
- Bulk edit, soft-delete, comments 패널
- Pre-Engineering 게이트는 4개 컬럼 + "Ready" 칩으로 가시화
- 행 클릭 → `/punch/:id` Detail

## 5. Dashboard
KPI: Total / In Progress / Completed / On Hold / Overall Planned vs Actual / Critical Behind / Pre-Eng Not Ready

차트:
- S-Curve (Planned vs Actual, daily snapshot)
- Team / Trade / Subcontractor 진행률 매트릭스
- Critical Watchlist (variance < −10% 또는 critical=상/중상 + behind)
- Pre-Engineering Bottleneck (게이트별 미승인 건수)
- Recent Comments

## 6. 공정률 계산
- `planned_progress_pct`: `defect-progress-calc.ts` 의 `computePlannedProgressPct` 재사용
- `progress_variance_pct = actual − planned`
- `health_status`: variance ≥ +5 Ahead / (−5,+5) On Track / (−15,−5] Behind / ≤ −15 Critical
- 매일 1회 cron edge function `punch-daily-snapshot`

## 7. Pre-Engineering 게이트 검증
트리거 `punch_compute_pre_eng()`:
- 4개 status가 모두 approved/secured/not_required → `pre_engineering_ready=true`
- 미완 게이트명을 `pre_engineering_blockers` 배열에 채움
- Detail 페이지에 Pre-Engineering 섹션(4개 게이트 + 승인일)

## 8. Export
- `DefectExportPage` 복제 → 컬럼 선택형 Excel export
- 헤더는 항상 `PUNCH_FIELDS.exportLabel` 사용 (라운드트립 보장)
- 프리셋: "All Columns" / "Pre-Engineering Status" / "Behind Schedule Only"

## 9. Phase 계획

**Phase 1 (이번 작업 기본 범위)**
- 테이블 + enum + RLS + 트리거 마이그레이션
- `punch-field-registry.ts` + 헤더 매핑 시드
- Sidebar / Routing / ModuleStatus
- Raw Data + Detail (CRUD, Pre-Engineering 게이트 포함)
- Import + ColumnSelectDialog + Import Logs (실패 시 status='failed')
- Export (라운드트립 보장)
- 라운드트립 자가 검증 테스트
- 기본 Dashboard (KPI + Critical Watchlist + Pre-Eng Bottleneck)
- Comments

**Phase 2**
- S-Curve + daily snapshot edge function
- Export 프리셋 확장
- 모바일 Quick Update
- Schedule Revision 페이지

**Phase 3**
- Bulk reassign / duplicate
- Simulation (To-Achieve 밴드)
- Custom fields UI 통합

승인하시면 Phase 1을 마이그레이션부터 순차 구현하겠습니다.
