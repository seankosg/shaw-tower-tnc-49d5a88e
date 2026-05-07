# Spare Part Excel Import — 구축 계획

OMM/Warranty 임포트와 동일한 아키텍처(adapter + provider + DocsImportShell)를 그대로 따라 Spare Part 임포트를 추가합니다.

## 1. 업로드 엑셀 구조 (확인 완료)

`Spare_Stock_Quantities_Summary` 형식:
- **3행**이 헤더: `S/N | MATERIAL | SPARES REQUIREMENTS | Unit | Spares Quantity | Required Area for Storage | Status | Remarks`
- **카테고리 그룹 행** (예: `A | Architectural`) — 카테고리 컨텍스트
- **부모 항목 행** (S/N=숫자, B열에 `Tiling (LLA-PM-LST-05-05-v02)` 형태) — `parent_item` + 괄호 안 코드 → `spec_ref`
- **자식 항목 행** (S/N=`a)`, `b)`...) — `material`, `spares_requirements`, `unit`, `spares_quantity`, `storage_area_required`, `status`, `remarks`

## 2. 신규/수정 파일

### 신규
- `src/lib/docs-spare-part-import-parser.ts` — 시트 파서 (헤더 자동 탐지, 카테고리/부모/자식 행 분류, `ParsedSparePartRow` 타입)
- `src/contexts/docs-import/SparePartImportContext.tsx` — `createDocsImportProvider`로 provider 생성
- `src/lib/docs-spare-part-import.ts` *(또는 기존 `docs-import-workers.ts`에 `sparePartAdapter` 추가)*

### 수정
- `src/contexts/docs-import/DocsImportProviders.tsx` — `SparePartImportProvider` 마운트
- `src/pages/docs/DocsImportPage.tsx` — `spare_part` 탭의 `disabled` 제거, `DocsImportShell` 연결
- `src/lib/docs-import-workers.ts` — `sparePartAdapter` export 추가

## 3. Adapter 동작

`sparePartAdapter: ImporterAdapter<ParsedSparePartRow>`
- `subModule: 'spare_part'`
- `keyFieldLabel: 'Category + S/N'` (복합 키)
- `dataDateRequired: false`
- `rawDataPath: '/docs/spare-part'`
- `getRowKey`: `${category}::${parent_sn}::${sn}` 형태로 idempotent 보장

### Upsert 로직
- 기존 행 로드: `docs_spare_part` where `project_id`, `is_active=true` → 위 복합 키로 Map
- 카테고리 그룹 행은 임포트 대상 아님(컨텍스트만 제공, skip 로그)
- 부모/자식 모두 row로 저장하되 `parent_item`/`sn` 조합으로 구분
- INSERT 200개 청크 + UPDATE 8 동시 실행 (ABD 패턴 그대로)
- `excludedFields` 적용 → UPDATE 시 제외 컬럼 보존
- 검증: `category` 또는 `parent_item` 또는 `material` 중 하나도 없으면 skip(`empty_row`)

### 추적 필드 (`SPARE_PART_TRACKED_FIELDS`)
`category`, `parent_item`, `sn`, `material`, `spec_ref`, `spares_requirements`, `unit`, `spares_quantity`, `storage_area_required`, `status`, `remarks`, `subcontractor_name`, `team`, `trade`, `hdec_pic_name`, `hdec_eng_name`

## 4. 기존 인프라 재사용

- **DocsImportShell**: 파일 드롭 → 시트 선택 → 헤더 매핑 → 미리보기 → 실행 → 결과/로그 표시 — 그대로 동작
- **Header Mappings**: Admin → Header Mappings 에 `spare_part` 모듈 항목이 자동 사용됨 (테이블 구조 이미 호환)
- **Field config**: `docs_field_config`의 `sub_module='spare_part'` 행으로 표시/편집 규칙 적용
- **Import logs**: `docs_upload_batches` + `docs_upload_row_logs` + `docs_change_log`에 그대로 기록 (이미 `sub_module` 컬럼 보유)

## 5. DB 변경

**없음.** `docs_spare_part` 테이블·RLS·`docs_upload_batches.sub_module`·`docs_change_log.sub_module` 모두 이미 존재합니다.

선택적으로 카테고리/부모/자식을 안정적으로 식별하기 위한 보조 컬럼이 필요하면 후속 마이그레이션으로 `parent_sn TEXT` 추가를 제안할 수 있으나, 1차 구현은 기존 `parent_item` + `sn` 조합으로 진행합니다.

## 6. 범위 외 (다음 단계)

- Detail 페이지, Comments, Bulk Action, Excel Export, Cycle Progress, Stage Funnel 집계 — 본 계획에서 제외 (요청 시 별도 진행)
