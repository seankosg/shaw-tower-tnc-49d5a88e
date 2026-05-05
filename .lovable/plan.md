
# OMM Raw Data — 구현 계획 (v5 최종)

OMM은 Docs 우산 아래 4개 sub-module 중 하나입니다 (`as_built`, `omm`, `warranty`, `spare_part`). 모든 통합점(Admin Header Mappings 탭, Admin Field Config 탭, header-mappings cache, Import 페이지, AppRouter, Bulk 편집)을 일관되게 확장합니다.

---

## v5 변경사항 (이전 대비)

1. **Copy 수량 비교 alert**:
   - `Readible PDF` (계약상 제출 필요한 PDF 부수) vs `PDF Check` (실제 제출 부수)
   - `Hardcopy` (계약상 제출 필요한 부수) vs `Hardcopy Check` (실제 제출 부수)
   - 두 값이 다르면 행에 시각적 alert 표시
2. **헤더 매핑 정정**:
   - Excel 헤더 `Category` → `category_group` 컬럼 (Architectural / Mechanical & Electrical / Miscellaneous)
   - Excel 헤더 `TEAM` → `category` 컬럼 + `team` ENUM 동시 (Architectural / Mechanical / Electrical)

---

## 0. Docs 4개 sub-module 통합 패턴 정리

| 통합점 | 현재 상태 | OMM 추가 작업 |
|---|---|---|
| `useDocsFieldConfig.ts` | 타입에 `'omm','spare_part'` 이미 선언됨 | 그대로 사용 |
| `header-mappings-cache.ts` | `MappingSubModule = '' \| 'as_built' \| 'warranty'` | `'omm' \| 'spare_part'` 추가 |
| `useHeaderMappings.ts` `DocsSubModule` | `'as_built' \| 'warranty'` | `'omm' \| 'spare_part'` 추가 |
| Admin → HeaderMappingsTab `DOCS_SUBMODULES` 레지스트리 | as_built / warranty 2개 | **omm + spare_part 항목 추가** + `DOCS_OMM_FIELDS` 화이트리스트 정의 |
| Admin → FieldConfigTab `docs` 탭 | `<FieldConfigTable table='docs_field_config' />` 단일 (sub_module 필터 없음) | **Docs 탭 내부에 4개 sub-module 탭** + `FieldConfigTable`에 `subModule` prop 추가 |
| `import_header_mappings` 데이터 | docs/as_built (96), docs/warranty (41) | **docs/omm 시드** (아래 매핑 표 기준 25개) |
| `docs_field_config` 데이터 | as_built, omm(legacy 15), warranty | omm 행 **재시드** (legacy 컬럼명 폐기 후 새 컬럼 기준) |
| `App.tsx` | `/docs/omm` 라우트 존재 | `/docs/omm/:id` 상세 라우트 추가 |
| `DocsImportPage` / `DocsImportContext` | as_built / warranty 분기 | **omm 분기 추가** |
| `DocsBulkEditBar` | as_built/warranty 필드 정의 | **omm 필드 정의 추가** (테이블=`docs_omm`) |
| `docs_change_log` / `docs_upload_batches` / `docs_upload_row_logs` | sub_module 컬럼 존재 | sub_module='omm'로 사용 |
| Comments | defect_comments 존재. ABD에는 없음 | 신규 `omm_comments` (defect_comments 동형 + RLS) |

---

## 1. 공통 마스터 재사용 원칙 (강제)

| OMM 필드 | 사용 마스터 | 비고 |
|---|---|---|
| HDEC PIC | `hdec_pic_master` + `auto-create-master-user` | Defect/ABD 동일 흐름. 별칭 매칭(JH Lee, MC Cha) 적용. |
| HDEC ENG | `hdec_eng_master` | 동일 |
| Subcontractor | `defect_subcontractor_workscope` + `docs_org_alias` | label/keywords 매처 |
| Team (시스템 ENUM) | `normalizeTeamValue` → `team` ENUM | Excel TEAM 값을 ENUM으로도 정규화 저장 |
| Trade | `docs-trade.ts` `resolveTrade` | 자동 산정 |
| 영업일 계산 | `business-days.ts` `addBusinessDaysNoSunday` | 일요일 제외 |
| Bulk 편집 | `BulkEditBar`/`DocsBulkEditBar` | omm 정의만 추가 |
| 코멘트 UI | `RecipientSelector`, `TranslatePanel` | 재사용 |

---

## 2. 헤더 매핑 (정정)

| Excel 헤더 | DB 필드 / 처리 |
|---|---|
| No | `sn` |
| **TEAM** (대문자) | `category` (Architectural / Mechanical / Electrical) + `team` ENUM 정규화 동시 저장 |
| **Category** | `category_group` (Architectural / Mechanical & Electrical / Miscellaneous) |
| Section | `section` |
| Work Trade / Material | `work_trade_material` |
| Subcontractor | raw → `subcontractor_name` + workscope 매처 → `subcontractor_id` |
| HDEC PIC | raw → `hdec_pic_name` + 마스터 자동 매칭/생성 |
| HDEC ENG | raw → `hdec_eng_name` + 마스터 자동 매칭/생성 |
| Instruction Date | `instruction_date` |
| D. Submission Planned Date | `draft_planned_date` |
| D. Submission Actual Date | `draft_actual_date` |
| **Readible PDF** | `pdf_required_qty` (integer, 계약상 제출 필요 부수) |
| **PDF Check** | `pdf_actual_qty` (integer, 실제 제출 부수) |
| **Hardcopy** | `hardcopy_required_qty` (integer, 계약상 제출 필요 부수) |
| **Hardcopy Check** | `hardcopy_actual_qty` (integer, 실제 제출 부수) |
| D. Response Date | `draft_response_date` |
| D. Response Status | `draft_response_status` (A/B/C/UR/WIP) |
| F. Submission Planned Date | `final_planned_date` |
| F. Submission Actual Date | `final_actual_date` |
| F. Response Planned Date | `final_response_planned_date` |
| F. Actual Respond Date | `final_response_actual_date` |
| F. Response Status | `final_response_status` (A/B/C/UR/WIP) |
| Traning Required | `training_required` |
| Remark | `remarks` |

`import_header_mappings`에 `module='docs', sub_module='omm', is_system=true`로 시드.

---

## 3. Copy 수량 alert 로직

### 데이터 표현
- 4개 신규 컬럼 모두 **integer NULL 허용** (`pdf_required_qty`, `pdf_actual_qty`, `hardcopy_required_qty`, `hardcopy_actual_qty`)
- Excel 셀이 비어 있으면 NULL, 숫자가 아니면 import 시 reject row log

### Alert 산출 (`computeOmmCopyAlert`)
- `pdf_short = pdf_required_qty != null && pdf_actual_qty != null && pdf_actual_qty < pdf_required_qty`
- `pdf_over = pdf_required_qty != null && pdf_actual_qty != null && pdf_actual_qty > pdf_required_qty`
- 동일 로직을 hardcopy에도 적용
- 한쪽만 채워진 경우 (예: required는 있는데 actual NULL) → 별도 `pdf_pending` 표시 (앰버)

### UI 표현 (Raw Data 페이지 셀)
- 두 컬럼을 묶음 셀로 렌더: `2 / 3` 형식 (실제 / 필요)
- **부족(red)**: 적색 배경 + 우측 ⚠ 아이콘 + tooltip "Submitted 2 / Required 3 (short by 1)"
- **초과(amber)**: 황색 배경 + tooltip "Submitted 4 / Required 3 (over by 1)"
- **일치(green)**: 옅은 녹색 텍스트
- **미제출(gray)**: 기본 색
- 행 레벨 종합 배지: PDF 또는 Hardcopy 중 하나라도 short/over면 행 좌측에 작은 ⚠ 도트

### 필터
- 컬럼 헤더 필터에 `Mismatch only` 빠른 토글 추가 (PDF/Hardcopy 각각)

---

## 4. 스키마 변경 (마이그레이션)

```text
TRUNCATE docs_omm;
ALTER TABLE docs_omm
  DROP COLUMN contract_doc, draft_section, draft_target_date, submission_target_date,
              submission_actual_date, approved_date, softcopy_required, hardcopy_required,
              contractor_supplier;

ALTER TABLE docs_omm ADD COLUMN
  category_group text,
  section text,
  instruction_date date,
  draft_planned_date date,
  draft_actual_date date,
  pdf_required_qty integer,
  pdf_actual_qty integer,
  hardcopy_required_qty integer,
  hardcopy_actual_qty integer,
  draft_response_date date,
  draft_response_status text,
  final_planned_date date,
  final_actual_date date,
  final_response_planned_date date,
  final_response_actual_date date,
  final_response_status text,
  training_required text,
  parent_id uuid references docs_omm(id) on delete cascade,
  resubmission_seq int default 0,
  is_resubmission boolean default false,
  subcontractor_id uuid,
  current_stage text,
  current_status text;
```

기존 시스템 공통 컬럼 (`category`, `hdec_pic_name`, `hdec_eng_name`, `subcontractor_name`, `team`, `trade`, `raw_payload`, `custom_payload`, `is_active`, `row_version`, `source_upload_id`, `data_source_type`, `updated_by`, `sn`)은 유지.

`docs_field_config (sub_module='omm')` 행은 기존 15개 삭제 후 새 컬럼 기준으로 재시드 (역할별 visible/editable 포함).

신규 `omm_comments` 테이블 (defect_comments 동형) + RLS 정책.

PL/pgSQL 함수 `create_omm_resubmission(parent_id uuid, stage text)` + `docs_omm` AFTER UPDATE 트리거.

---

## 5. 워크플로우 규칙

### 단계 진행
- Draft `A` → Final 단계 활성화
- Final `A` → 행 **Approved**로 잠김 (read-only)
- Draft 또는 Final `B`/`C` → **자동 재제출 행 생성**

### 자동 재제출 행 생성 (`create_omm_resubmission`)
1. 부모 `sn` (예: `06`) 기준 다음 미사용 접미번호 결정 (`06-01`, `06-02`, …)
2. 새 행 INSERT: `sn = '06-01'`, `parent_id`, `is_resubmission = true`, `resubmission_seq = parent.seq + 1`
3. 식별 정보 복사: `team`, `category`, `category_group`, `section`, `work_trade_material`, `subcontractor_name`, `subcontractor_id`, `hdec_pic_name`, `hdec_eng_name`, `pdf_required_qty`, `hardcopy_required_qty` (계약 부수는 동일)
4. 생성일 `D0` 기준 자동 일정 (`addBusinessDaysNoSunday`):
   - **Draft 거절**: `draft_planned_date = D0 + 3영업일`, `final_response_planned_date = draft_planned_date + 7영업일`
   - **Final 거절**: `final_planned_date = D0 + 3영업일`, `final_response_planned_date = final_planned_date + 7영업일`
5. UI 정렬: 부모 바로 아래 (`sn` + `resubmission_seq`)
6. Idempotent: 동일 단계 자식이 이미 존재하면 skip

### 필드 비활성화
- Draft `A` + Final `B`/`C` → 해당 행의 Draft 제출 관련 필드 read-only
- `current_stage = 'Closed'` (Final A) → 행 전체 read-only
- 재제출 행은 부모의 Draft가 이미 승인된 경우 Draft 비활성 상태 상속

### 트리거
- DB 트리거 `docs_omm` AFTER UPDATE — response_status 컬럼 변경 시 호출
- Import upsert 경로에서도 동일 함수 작동

---

## 6. Admin 탭 확장

### 6-1. Header Mappings 탭
- `DOCS_SUBMODULES` 레지스트리에 **2개 항목 추가**:
  ```ts
  { key: 'omm', label: 'OMM', fields: DOCS_OMM_FIELDS },
  { key: 'spare_part', label: 'Spare Part', fields: DOCS_SPARE_PART_FIELDS }
  ```
- `DocsSubKey` 타입 확장 → `'as_built' | 'warranty' | 'omm' | 'spare_part'`
- `DOCS_OMM_FIELDS` 화이트리스트 (위 §2 매핑 기준 25개 + `current_status`, `current_stage` 등 파생 필드)
- Spare Part 화이트리스트는 placeholder만 (별도 작업)

### 6-2. Field Config 탭
- 현재 `<FieldConfigTab>`의 Docs 탭은 `<FieldConfigTable table='docs_field_config' />` 단일 호출 → as_built 데이터만 표시되는 한계
- **개선**: `FieldConfigTable`에 `subModule?: string` 옵션 prop 추가
  - 데이터 SELECT에 `.eq('sub_module', subModule)` 필터
  - INSERT/UPDATE 시 `sub_module` 자동 채움
- Docs 탭 내부에 sub-module Tabs (`as_built` / `omm` / `warranty` / `spare_part`) 추가
- 각 탭이 `<FieldConfigTable table='docs_field_config' subModule='omm' title='Docs / OMM Field Configuration' showOrigin />` 호출

### 6-3. 헤더 캐시
- `MappingSubModule` 타입에 `'omm'`, `'spare_part'` 추가
- `useHeaderMappings.ts`의 `DocsSubModule`도 확장

---

## 7. Import 흐름

신규 `src/lib/docs-omm-import-parser.ts` — `docs-import-parser.ts` 패턴.
- 단일 헤더 행
- `getMappedField('docs', alias, 'omm')` 캐시 매핑
- `normalizeDate` 재사용
- 정수 셀 (`pdf_required_qty` 등) 파싱: 비어있으면 NULL, 숫자 변환 실패시 row reject
- HDEC PIC/ENG: `auto-create-master-user` 호출
- Subcontractor: workscope 매처
- 미매핑 헤더는 `UnmappedAliasQueue`로 (sub_module='omm')

`DocsImportPage` & `DocsImportContext`에 `omm` 분기 추가. `docs_upload_batches.sub_module='omm'`로 기록.

Upsert 키: `(project_id, sn)` — `06-01`은 별도 행으로 유지.

---

## 8. Raw Data 페이지 — 기능 패리티

`src/pages/docs/DocsOMMRawDataPage.tsx`를 **DefectRawDataPage 미러로 전면 재작성**.

Defect에서 가져오는 기능:
- TanStack Table + 가상화, 컬럼 리사이즈, 좌측 컬럼 고정
- 컬럼별 필터 (multi-select / text / date-range / number-mismatch) + 글로벌 검색
- 정렬 (기본: `sn` + `resubmission_seq`)
- `useDocsFieldConfig('omm')` 기반 visible/editable
- Bulk 편집/삭제/재배정 (HDEC PIC, HDEC ENG, Subcontractor 셀렉터는 공통 마스터 dropdown)
- 행별 코멘트 (`omm_comments`) + RecipientSelector + TranslatePanel
- Excel export (subcon별 ZIP 임계값 7) — view + reimport 두 형식
- 행 상세 페이지 `/docs/omm/:id` + change log + 코멘트 스레드
- URL 쿼리에 필터/정렬 영속화
- Mobile compact 모드
- 필드 편집 시 `docs_change_log` (sub_module='omm') 감사 로그

ABD에서 가져오는 기능:
- `current_status` 컬러 배지 (신규 `computeOmmStatus`)
- Risk pill (Red/Amber/Green) — `final_response_planned_date` 대비 지연
- Cycle progress 미니 그래픽 (Draft → Final → Approved)
- `resolveTrade`로 trade 산정
- Frozen header + 상단 가로 스크롤바
- `module_docs_status` 모듈 일시중단 배너

OMM 전용 시각 요소:
- PDF/Hardcopy 부수 mismatch 셀 (위 §3)
- 응답 상태 배지: `A` 녹색, `B`/`C` 빨강, `UR` 주황, `WIP` 파랑
- 재제출 행: `sn` 들여쓰기 + 화살표 + 옅은 배경
- `category_group`은 그룹/필터 컬럼

---

## 9. 상태 산정 (`src/lib/docs-omm-status.ts` 재작성)

```
computeOmmStatus(row):
  if final_response_status == 'A' → 'Approved'
  else if final_actual_date && !final_response_status → 'Final Under Review'
  else if final_planned_date && !final_actual_date → 'Pending Final Submission'
  else if draft_response_status == 'A' → 'Pending Final Submission'
  else if draft_actual_date && !draft_response_status → 'Draft Under Review'
  else if draft_planned_date && !draft_actual_date → 'Pending Draft'
  else → 'Pending Draft'
```

재제출 행은 배지에 R1/R2 접미사 (`Pending Draft (R1)`).

`computeOmmCopyAlert(row)` → `{ pdf: 'ok'|'short'|'over'|'pending', hardcopy: 'ok'|'short'|'over'|'pending' }` 분리 export.

---

## 10. 변경/생성 파일 요약

**신규**
- `src/lib/docs-omm-import-parser.ts`
- `src/lib/docs-omm-excel-export.ts`
- `src/lib/docs-omm-status.ts` (재작성, copy alert 헬퍼 포함)
- `src/components/docs/OmmStatusBadge.tsx`
- `src/components/docs/OmmCycleProgress.tsx`
- `src/components/docs/OmmCopyQuantityCell.tsx` (PDF/Hardcopy 부수 비교 셀)
- `src/pages/docs/DocsOMMDetailPage.tsx`
- DB 마이그레이션:
  - `docs_omm` 스키마 재구성 (TRUNCATE + DROP + ADD)
  - `docs_field_config (sub_module='omm')` 재시드
  - `import_header_mappings (module='docs', sub_module='omm')` 25개 시드
  - `omm_comments` 테이블 + RLS
  - `create_omm_resubmission` 함수 + AFTER UPDATE 트리거

**수정**
- `src/pages/docs/DocsOMMRawDataPage.tsx` (전면 재작성)
- `src/pages/docs/DocsImportPage.tsx` (omm sub-module)
- `src/contexts/DocsImportContext.tsx` (omm 분기)
- `src/lib/header-mappings-cache.ts` (`MappingSubModule` 확장)
- `src/hooks/useHeaderMappings.ts` (`DocsSubModule` 확장)
- `src/pages/admin/HeaderMappingsTab.tsx` (`DocsSubKey` 확장 + `DOCS_OMM_FIELDS`/`DOCS_SPARE_PART_FIELDS` 추가 + 레지스트리 등록)
- `src/pages/AdminPage.tsx` (`FieldConfigTab` Docs 탭 내 sub-module Tabs + `FieldConfigTable`에 `subModule` prop 추가)
- `src/App.tsx` (`/docs/omm/:id` 라우트)
- `src/components/raw-data/DocsBulkEditBar.tsx` (omm 설정)

---

## 11. 범위 외
- OMM 전용 Dashboard 위젯
- 재제출 자동 생성 시 이메일 알림
- 표준 view/reimport 외 OMM 전용 export preset
- Spare Part Admin 화이트리스트의 실제 필드 정의 (placeholder만 등록)

---

## 12. 실행 순서
1. DB 마이그레이션 (스키마 재구성, 헤더 매핑 시드, field_config 재시드, omm_comments, 트리거)
2. `header-mappings-cache.ts` / `useHeaderMappings.ts` / `HeaderMappingsTab.tsx` / `AdminPage.tsx`의 sub-module 등록 확장
3. Import 파서 + DocsImportPage/Context 확장
4. Raw Data 페이지 전면 재작성 + 상세 페이지 + Copy 수량 셀
5. Bulk 편집 + 코멘트 + Excel export
6. 동작 검증 (업로드 → 행 생성 → status B/C → 재제출 자동행 / Copy mismatch alert 표시 확인)
