## Investigation summary

업로드된 `STR-List_of_Warranties_★_Updated_rev.01.xlsx`는 정상적으로 import 되었습니다 (140 rows, 185 threads). 다만 다음 3가지 문제가 발견되어 데이터가 "제대로 보여지지 않는" 것처럼 느껴집니다.

### 확인된 사실 (DB 실측)
- `warranty_items` 140건, 모두 `is_active=true`, 각 `item_no` 유일 (resubmission 0건)
- `warranty_threads` 185건 정상 적재
- 대부분 컬럼 정상: `r_acra_reg_no` 129/140, `r_acra_address` 129/140, `r_director_1` 128/140, `r_brief_description` 130/140, `subcon_signing_planned_date` 118/140, `final_status` 140/140 등
- 원본 파일에 비어있는 컬럼은 DB도 비어있음 (`hdec_pic_name`, `hdec_eng_name` → 원본 0/179)

### 발견된 버그 3종

**1. 파서 버그 — `acra_info_status`가 항상 NULL**
원본 파일은 "Submitted" 값을 129행 가지지만 DB 컬럼은 0건. 원인: `src/lib/docs-warranty-import-parser.ts`에서 `f.endsWith('_status')` 조건이 `acra_info_status`까지 잡아 `normalizeWarrantyStatus()`에 넘기는데, 이 함수는 A/B/C/UR/WIP/Planned 만 인정하므로 "Submitted" → null이 됩니다. `acra_info_status`는 자유 텍스트 필드여야 합니다.

**2. Import Logs 페이지에 Warranty 이력이 안 보임**
`src/pages/docs/DocsImportLogsPage.tsx` (line 124)이 `docs_upload_batches`만 조회합니다. Warranty importer는 별도 테이블 `warranty_upload_batches`에 기록하기 때문에 "No import history"로 표시됩니다 (세션 리플레이 확인).

**3. `warranty_items.subcontractor_id` 0/140 (참고)**
파일의 모든 Subcontractor명이 master에 매칭되지 않아 link 미생성. 이건 master 시드 이슈로 별건이라 본 작업에서는 다루지 않습니다.

## Fix Plan

### A. 파서 수정 — `acra_info_status` 텍스트로 처리
`src/lib/docs-warranty-import-parser.ts`
- `STATUS_FIELDS`(또는 인라인) 화이트리스트로 변경: `draft_status`, `subcon_signing_status`, `hdec_signing_status`, `final_status` 4개만 `normalizeWarrantyStatus`로 처리.
- 그 외 `_status`로 끝나는 필드(현재는 `acra_info_status` 한 개)는 자유 텍스트(`toText`).

### B. 기존 데이터 보정 마이그레이션
- 마이그레이션 SQL: `raw_payload->>'ACRA Info'`에 값이 있고 `acra_info_status`가 NULL인 행을 일괄 업데이트.
- 영향 범위: 약 129행.

### C. Import Logs에 Warranty 배치 표시
`src/pages/docs/DocsImportLogsPage.tsx`
- 기존 `docs_upload_batches` 쿼리와 병행해 `warranty_upload_batches`도 조회.
- 컬럼 차이(`source_filename` vs `uploaded_file_name`, `inserted_rows`+`updated_rows` vs `success_rows` 등)를 정규화한 공통 형태로 합쳐 정렬.
- `sub_module='warranty'`로 표기해서 한 화면에 모이도록.

### D. 검증
- 마이그레이션 후 `select count(*) where acra_info_status='Submitted'` 가 ~129가 되는지 확인.
- Raw Data 페이지에서 ACRA Info 컬럼이 채워져 보이는지 확인 (필드 config sort_order에 `acra_info_status` 노출 여부 확인 — 비활성이면 enable 권장).
- Import Logs 페이지에서 방금 올린 warranty 배치가 보이는지 확인.

## 사용자 확인 사항

원본 파일 자체에 비어있는 컬럼(HDEC PIC, HDEC ENG, 일부 행의 [R] Description / Witness 등)은 import 결과도 비어있는 것이 정상입니다. 혹시 이 부분도 "데이터가 빠진 것"으로 느끼셨다면 알려주세요 — Excel 원본을 보강하는 방향으로 안내드리겠습니다.
