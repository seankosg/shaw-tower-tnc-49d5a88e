
## 검토 결과 요약

Admin → Header Mapping 탭이 노출하는 필드 화이트리스트(`HeaderMappingsTab.tsx`의 `TNC_FIELDS`, `DEFECT_FIELDS`, `DOCS_AS_BUILT_FIELDS`, `DOCS_WARRANTY_FIELDS`)와 실제 DB 테이블(`*_items`, `docs_drawings`, `*_field_config`) 컬럼, 그리고 파서(`import-parser.ts`, `defect-parser.ts`, `docs-import-parser.ts`)에서 인식하는 헤더 alias를 비교한 결과입니다.

### 1. 화이트리스트(Admin UI) ↔ DB 스키마 일치성
- **TNC, Defect, Docs/As-Built, Docs/Warranty** 모두 화이트리스트의 필드명이 실제 테이블 컬럼/`*_field_config`와 일치합니다. 노출 누락 컬럼 없음.

### 2. DB `import_header_mappings`에 alias가 전혀 없는 필드 (Admin에서 "empty"로 보이는 그룹)

화이트리스트엔 있지만 활성 alias 0개 — 즉 사용자가 그 헤더로 임포트해도 매핑이 하드코딩 fallback에만 의존하는 상태.

**Docs / As-Built (25개 누락)**:
- `current_status`
- `series`, `level_location`, `sequential_no`
- `sub1_planned_date`, `sub1_submission_date`, `sub1_approval_date`, `sub1_actual_response_date`, `sub1_approval_status`
- `sub2_planned_date`, `sub2_submission_date`, `sub2_approval_date`, `sub2_actual_response_date`, `sub2_approval_status`
- `sub3_planned_date`, `sub3_submission_date`, `sub3_approval_date`, `sub3_actual_response_date`, `sub3_approval_status`
- `transmittal_number`, `transmittal_due_date`, `days_due`
- `hdec_pic_name`, `hdec_eng_name`

**Docs / Warranty (5개 누락)**:
- `validation_acra`, `validation_signature`, `validation_witness`, `validation_seal`, `validation_pass`

**TNC / Defect**: 누락 없음.

### 3. DB에는 있지만 화이트리스트엔 없는 legacy alias

- `docs/as_built`의 `aconex_status`, `submitted_date`, `approved_date` (각 2개씩) — 현 v2 스키마에선 `current_status`/`sub1_*`로 대체됨. Admin UI에는 "(unmapped)" 그룹으로 떠야 정상.

---

## 수정 계획

### 1. `import_header_mappings`에 시스템 alias 시드 추가 (DB migration)

각 누락 필드별 1개 이상의 canonical alias를 `is_system=true`, `is_active=true`로 추가합니다. 키는 파서가 사용하는 normalized alias와 일치해야 합니다 (소문자, trim, 마침표 제거).

**Docs / As-Built**:
| target_field | header_alias |
|---|---|
| `current_status` | `status`, `aconex status` |
| `series` | `series` |
| `level_location` | `level / location`, `level location` |
| `sequential_no` | `sequential no`, `seq no` |
| `sub1_planned_date` | `submission 1 \| planned date` |
| `sub1_submission_date` | `submission 1 \| submission date` |
| `sub1_approval_date` | `submission 1 \| approval date` |
| `sub1_approval_status` | `submission 1 \| approval status` |
| `sub1_actual_response_date` | `submission 1 \| actual response date` |
| `sub2_*` | 위와 동일 패턴 (`submission 2 \| ...`) |
| `sub3_*` | 위와 동일 패턴 (`submission 3 \| ...`) |
| `transmittal_number` | `transmittal number`, `transmittal no` |
| `transmittal_due_date` | `transmittal due date` |
| `days_due` | `days due` |
| `hdec_pic_name` | `hdec pic`, `hdec p.i.c`, `pic` |
| `hdec_eng_name` | `hdec eng`, `hdec engineer` |

**Docs / Warranty**:
| target_field | header_alias |
|---|---|
| `validation_acra` | `validation acra`, `acra` |
| `validation_signature` | `validation signature`, `signature` |
| `validation_witness` | `validation witness`, `witness` |
| `validation_seal` | `validation seal`, `seal` |
| `validation_pass` | `validation pass`, `pass` |

`ON CONFLICT DO NOTHING` 패턴(또는 사전 select)으로 중복 삽입을 방지합니다.

### 2. Legacy alias 처리

`docs/as_built`의 `aconex_status`, `submitted_date`, `approved_date` 매핑은 화이트리스트에 없어 Admin UI에서 "(unmapped)"로 노출됩니다. 처리 방안:

- **권장**: `is_active=false`로 비활성화 (parser는 v2 sub*_ 필드를 사용하므로 영향 없음, raw_payload엔 그대로 남음)
- 또는 그대로 두되 사용자에게 unmapped 그룹의 의미를 안내

본 계획에서는 **비활성화**합니다. 데이터는 보존됩니다.

### 3. 파서 일치 검증 (코드 변경 없음)

- `docs-import-parser.ts`: `SUB_ALIAS` 키(`'planned date'`, `'submission date'`, `'approval date'`, `'approval status'`)가 banded header에서 `submission N | <sub>` 합성 키로 만들어지므로, 위 시드 alias와 1:1 일치합니다. 추가로 `actual response date` sub-alias는 현재 파서 `SUB_ALIAS`에 없음 — 향후 raw 파일에 등장하면 파서 보강이 필요하지만, 본 작업 범위 외.
- `import-parser.ts`(TNC), `defect-parser.ts`(Defect): 누락 필드 없음.

### 4. 사용자 검증 절차

migration 적용 후 Admin → Header Mappings → Docs / As-Built 탭에서 "Show empty fields" 체크 해제 시 25개 그룹이 모두 alias를 가진 상태로 표시되며, "Mapping Test"에 위 alias를 입력하면 system 배지와 함께 target field가 매칭됩니다.

## 영향 범위

- **새 Excel 임포트 동작**: DB cache가 hardcoded fallback보다 우선이므로 동일하게 동작 (시드 alias가 fallback과 동일).
- **기존 데이터**: 변경 없음.
- **위험**: 낮음. DB 추가/비활성화만 수행, 코드 변경 없음.

## Out of Scope

- `docs_field_config`/`defect_field_config`/`field_config` 자체의 표시 메타(이전 작업에서 정리 완료).
- 파서 SUB_ALIAS에 `actual response date` 추가 (raw Aconex 파일이 해당 컬럼을 export 하기 시작하면 별도 작업).
- Custom field alias.
