
# 필드 매핑 관리: Docs 모듈 (sub-module 차원 도입)

## 배경 / 구조 정정

Docs는 단일 상위 모듈이며, 그 안에 여러 sub-module이 존재합니다:
- `as_built` (도면)
- `warranty` (보증서)
- 향후 추가될 sub-module들 (예: O&M, shop drawing 등)

이미 DB에는 이 구조가 반영되어 있습니다 — `docs_drawings.sub_module`, `docs_upload_batches.sub_module` 컬럼 존재.

따라서 Header Mappings도 **`module='docs'` 단일 값 + `sub_module` 차원**으로 관리해야 하며, T&C / Defect와 같은 평면 enum이 아닙니다.

## 변경 범위

### 1. DB 스키마 — `import_header_mappings`에 `sub_module` 컬럼 추가 (마이그레이션)
```sql
ALTER TABLE import_header_mappings
  ADD COLUMN sub_module text;  -- nullable; tnc/defect는 NULL, docs는 'as_built'|'warranty'|...

-- 기존 unique 제약(있다면) 재정의: (module, COALESCE(sub_module,''), header_alias)
```
- `tnc`, `defect`는 sub_module이 NULL로 유지 — 기존 데이터 영향 없음.
- `custom_field_definitions`도 동일 패턴으로 `sub_module` 컬럼 추가 (Docs sub-module별로 custom field가 분리되어야 하므로).

### 2. DB 시드 데이터 — Docs sub-module 매핑 (insert)
- **`docs` / `as_built`** system seeds:
  - target_field 화이트리스트: `document_no, title, revision, discipline, document_type, organisation_raw, aconex_status, submitted_date, approved_date, is_submitted, remarks`
  - Aconex 표준 헤더 alias seed (Document No, Title, Rev, Discipline, Doc Type, Originating Organisation, Status, Submitted Date, Approved Date 등)
- **`docs` / `warranty`** system seeds:
  - target_field 화이트리스트: `item_no, category, sub_category, warranted_item, subcontractor_name_raw, sc_target_date, internal_target_date, stage1_date ~ stage9_date, witness_director, witness_secretary, validation_acra, validation_signature, validation_witness, validation_seal, validation_date, validation_pass, remarks`
  - 신규 모듈이므로 핵심 alias만 seed, 나머지는 Admin이 UI에서 추가

### 3. UI — `src/pages/admin/HeaderMappingsTab.tsx`
- `ModuleKey` 타입 확장:
  ```ts
  type ModuleKey =
    | { module: 'tnc' }
    | { module: 'defect' }
    | { module: 'docs', sub_module: 'as_built' | 'warranty' };
  ```
  실제 구현은 `module + sub_module` 튜플 키로 단순 처리.
- Tabs 구조 2단계:
  - 상위: `T&C` / `Defect` / `Docs`
  - `Docs` 선택 시 하위 sub-tabs: `As-Built` / `Warranty` (+ 향후 sub-module 추가 시 자동 확장 가능한 배열로 관리)
- `DOCS_SUBMODULES` 상수로 sub-module 메타(label, fieldList, normalize 규칙) 등록 — 신규 sub-module 추가 시 이 배열에 한 줄만 추가하면 UI 자동 노출되도록 설계
- `normalizeAlias(module, sub_module, raw)` — sub-module별 정규화 규칙 분기
- `useHeaderMappings` hook 및 mapping CRUD에 `sub_module` 파라미터 전달
- MappingDialog는 `module + sub_module` 둘 다 prop으로 받아 insert 시 함께 저장

### 4. Hook 업데이트 — `src/hooks/useHeaderMappings.ts`
- 반환 row에 `sub_module` 포함
- `useCustomFields` 도 동일하게 `sub_module` 필터 지원

### 5. 파서 적용은 별도 단계 (이번 plan 범위 밖)
- Docs/Warranty 파서가 실제로 `import_header_mappings`를 lookup 하도록 바꾸는 작업은 Warranty 본 구현 시 일괄 처리.
- 이번 plan은 **Admin 관리 화면 + DB 스키마 + seed**까지.

## 영향 받는 파일

| 파일 | 변경 |
|---|---|
| `supabase/migrations/<ts>_add_submodule_to_header_mappings.sql` | 신규 — `sub_module` 컬럼, unique 인덱스 재정의 |
| (insert tool) Docs/As-Built + Docs/Warranty system alias seed | 신규 데이터 |
| `src/pages/admin/HeaderMappingsTab.tsx` | 모듈 enum + sub-tab UI, sub_module 인지 |
| `src/hooks/useHeaderMappings.ts` | sub_module 컬럼 반환 |
| `src/hooks/useCustomFields.ts` | sub_module 필터 지원 (영향 시) |

## 가정

- (A) `import_header_mappings.module`은 text — 그대로 유지, sub_module만 새로 추가.
- (B) 기존 tnc/defect mapping은 sub_module = NULL이며 unique 키 변경 후에도 무결성 유지.
- (C) 향후 Docs 하위 sub-module 추가는 `DOCS_SUBMODULES` 배열에 항목 추가 + seed insert만으로 완결.
- (D) Warranty seed의 target_field 명칭은 03_WARRANTY_deed.md 스펙 기준 (실제 테이블 생성은 Warranty 본 구현 시).

## 검증 방법

1. Admin → Header Mappings 탭에 상위 탭 `T&C` / `Defect` / `Docs` 노출
2. `Docs` 선택 시 하위 탭 `As-Built` / `Warranty` 노출
3. As-Built 탭에서 `Document No`, `Originating Organisation` 등 system alias 표시 (lock 아이콘)
4. Warranty 탭에서 신규 alias 추가 → 새로고침 후 유지
5. T&C / Defect 탭은 기존과 동일하게 동작 (regression 없음)
6. Mapping Test 입력 시 현재 선택된 module+sub_module 컨텍스트로 정확히 매칭되는지 확인
