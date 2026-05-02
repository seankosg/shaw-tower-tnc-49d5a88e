# Warranty Deed Sub-module — Implementation Plan

승인된 가정 (Stage 9 manual / Witness dropdown+free-text / ACRA auto-fill empty + conflict queue / Unnumbered match by source_row_position+warranted_item hash) 기준으로 진행합니다.

---

## Step 1 — DB Migration (먼저 적용)

### 1.1 `subcontractor_master` 컬럼 보강 (모두 nullable)
- `acra_no text`
- `acra_registered_address text`
- `director_1_name text`
- `director_2_name text`
- `secretary_name text`
- `contract_start_date date`
- `contract_end_date date`

### 1.2 신규 테이블 — `warranty`
- PK: `(project_id, item_no)`
- 컬럼: `id uuid`, `project_id`, `item_no`, `category`, `sub_category`, `warranted_item`, `subcontractor_name_raw`, `subcontractor_id` (FK→subcontractor_master, nullable), `source_row_position int`, `row_hash text` (unnumbered 매칭용 = md5(source_row_position||warranted_item))
- 일정: `sc_target_date date` (project SC), `internal_target_date date` (sc - 27일 자동 계산)
- Stages: `stage1_date` ~ `stage9_date` (9개 date 컬럼)
- Witness: `witness_director text`, `witness_secretary text`
- Validation 체크박스 5종: `validation_acra`, `validation_signature`, `validation_witness`, `validation_seal`, `validation_date` (모두 boolean default false)
- 자동 계산: `validation_pass boolean` (5개 모두 true일 때 trigger로 자동 set)
- `remarks text`, `raw_payload jsonb`, `custom_payload jsonb`, `data_source_type`, `source_upload_id`, `is_active`, `row_version`, audit columns
- RLS: docs_drawings 패턴 동일 (read 전체, insert/update는 user 이상 role)

### 1.3 신규 테이블 — `warranty_discussion` (long-format child)
- PK: `id uuid`
- FK: `warranty_id uuid` (cascade delete), `project_id`
- `discussion_type text` (Excel C14~C19 컬럼명 매핑: meeting_note / submitted_by / received_by / etc.)
- `discussion_date date`, `content text`, `author text`, `sort_order int`
- RLS: warranty 패턴 동일

### 1.4 Import 추적 테이블
- `warranty_upload_batches` (defect_upload_batches 구조 미러)
- `warranty_upload_row_logs` (defect_upload_row_logs 미러)
- `warranty_change_log` (docs_change_log 미러)
- `warranty_acra_conflict_queue` — ACRA 자동 채움 충돌 시 review queue
  - `id`, `subcontractor_id`, `field_name`, `existing_value`, `incoming_value`, `source_upload_id`, `resolved boolean default false`, `resolved_by`, `resolved_at`

### 1.5 Trigger / Function
- `warranty_compute_internal_target()` — sc_target_date 변경 시 internal_target_date = sc - 27일
- `warranty_compute_validation_pass()` — 5개 validation 컬럼 변경 시 validation_pass 갱신
- `warranty_compute_row_hash()` — insert/update 시 row_hash 자동 계산

### 1.6 `app_settings` seed
- `warranty_lead_days` = 27
- `warranty_module_config` = { stages: [{n:1,name:"..."},...9], validation_fields: [...] }

### 1.7 `import_header_mappings` seed (docs/warranty)
- 31개 system alias (item_no, category, sub_category, warranted_item, subcontractor_name, sc_date, stage1_date~stage9_date, witness_director, witness_secretary, validation_acra~validation_date, remarks, C14~C19 discussion 컬럼)

---

## Step 2 — Import Parser (`src/lib/warranty-import-parser.ts`)
- Multi-sheet Excel 처리 (시트별 category)
- "Unnumbered" 행 자동 ID 생성 (`UNNUM-{sheet}-{rowIdx}`)
- Category header 행 skip
- Long-format C14~C19 → `warranty_discussion` child rows
- ACRA 컬럼이 시트에 있으면 subcontractor_master 자동 채움 (빈 값만, 충돌은 conflict queue 적재)
- Header alias는 `import_header_mappings` (module=docs, sub_module=warranty) lookup

## Step 3 — Risk 계산 (`src/lib/warranty-risk.ts`)
- Stage 9 완료 → green
- 미완료 시 today vs internal_target_date (sc-27d):
  - past → red
  - within 7d → amber
  - else → green

## Step 4 — Pages (`src/pages/docs/warranty/`)
- `WarrantyDashboardPage.tsx` — KPI (total / passed / pending / red), risk distribution, validation 통과율
- `WarrantyImportPage.tsx` — Excel 업로드, parser 호출, dry-run preview, ACRA 충돌 queue 안내
- `WarrantyRawDataPage.tsx` — 필터/검색 가능 테이블 (item_no, category, warranted_item, stage progress, validation_pass, risk)
- `WarrantyDetailPage.tsx` — Stage 1~9 입력, witness dropdown(master director_1/2/secretary) + free-text fallback, validation 체크박스 5종, discussion thread, ACRA 정보 표시
- `WarrantyExportPage.tsx` — Excel export (placeholder)

## Step 5 — Routing & Sidebar
- `/docs/warranty/dashboard|import|raw-data|export`, `/docs/warranty/:id`
- `AppSidebar.tsx` Docs 섹션에 Warranty 메뉴 추가
- `RoleGuard` docs 모듈 일원화 (이미 적용됨)

## Step 6 — Module Status
- `module_warranty_status` 별도 키는 만들지 않고 `module_docs_status` 하위로 통합 (Docs pause 시 Warranty도 pause)

## Step 7 — Admin 통합 (`AdminPage.tsx`)
- `subcontractor_master` 편집 화면에 ACRA 컬럼 7종 inline edit
- ACRA conflict queue 처리 패널 신규 탭 (admin only)

## Step 8 — Header Mapping seed 적용
- `import_header_mappings` insert via insert tool (Step 1 migration 적용 후)

## Step 9 — Tests
- `warranty-import-parser.test.ts` — unnumbered 행, category header skip, discussion child 분해
- `warranty-risk.test.ts` — green/amber/red 경계
- `warranty-validation.test.ts` — 5개 체크박스 → validation_pass 자동화

---

## 영향 받는 파일

| 분류 | 파일 |
|---|---|
| 마이그레이션 | `supabase/migrations/<ts>_warranty_schema.sql` 신규 |
| 데이터 시드 | header_mappings + app_settings (insert tool) |
| 파서/유틸 | `src/lib/warranty-import-parser.ts`, `src/lib/warranty-risk.ts` 신규 |
| 페이지 | `src/pages/docs/warranty/*` 5개 신규 |
| Context | `src/contexts/WarrantyImportContext.tsx` 신규 |
| 라우팅 | `src/App.tsx` |
| 사이드바 | `src/components/layout/AppSidebar.tsx` |
| Admin | `src/pages/AdminPage.tsx`, ACRA conflict queue 컴포넌트 신규 |
| 테스트 | `src/test/warranty-*.test.ts` 신규 |

## 검증

1. Migration 적용 → `\d warranty`, `\d warranty_discussion`, `\d subcontractor_master` 컬럼 확인
2. Sample Excel import → unnumbered/numbered 모두 적재, discussion child 생성
3. ACRA 컬럼이 master에 자동 채움 (빈 칸), 충돌 시 conflict queue 적재
4. Detail에서 5개 체크 → validation_pass 자동 true
5. Stage 9 입력 시 risk green 전환
6. Re-import 시 source_row_position+warranted_item 해시로 unnumbered 행이 동일 row로 매칭됨
7. Docs 모듈 pause 시 Warranty 페이지도 차단됨
