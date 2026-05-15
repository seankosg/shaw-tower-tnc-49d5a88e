죄송합니다. 이전 plan은 Defect Raw Data 패턴을 그대로 적용하지 않았습니다. 아래는 **DefectRawDataPage.tsx와 동일한 3-레이어(visibility / order / dynamic) 구조**를 Spare Part Raw Data에도 그대로 이식하는 계획입니다.

## 적용할 Defect 패턴 (참조: `src/pages/DefectRawDataPage.tsx` L753–1049)

1. `useDocsFieldConfig('spare_part')`에서 `isFieldVisible`, `sortFieldNames`, `fields: fieldConfigRows` 모두 사용
2. **정적 컬럼**: `SPARE_PART_RAW_FIELDS` 기반 dataColumns 생성 (지금과 유사)
3. **동적 컬럼**: `fieldConfigRows` 중 `is_enabled && !knownIds.has(field_name) && !isMetaField(...)` 인 행을 자동 컬럼으로 추가 — `raw_payload`/`custom_payload` fallback accessor 포함
4. **columnVisibility**: `allColumnIds`를 돌며 `isFieldVisible(id, roles)`로 결정 (pinned 컬럼 제외)
5. **columnOrder**: `[__select, ...PINNED_FRONT, ...sortFieldNames(remaining)]`로 Field Config `sort_order` 반영
6. `useReactTable`에 `columnOrder`, `columnVisibility` state 전달

## 구체 변경

### A. `src/lib/spare-part-utils.ts`
- `SparePartItem`에 `item_no: number | null` 추가
- `SPARE_PART_RAW_FIELDS`에 `item_no`, `sn_outline` 추가 (현재 누락 → DB에 데이터 있음에도 안 보이는 직접 원인)
- `updated_at`, `created_at`은 RAW_FIELDS에서 제거 (Defect와 동일하게 메타로 분리)

### B. `src/pages/docs/DocsSparePartRawDataPage.tsx`
- `useAuth()`에서 `roles` 추출 (없으면 `useUserRoles` 훅 사용 — Defect 페이지와 동일 방식 확인 후 동일하게)
- 컬럼 빌드:
  - `selectColumn`, `progressColumn` (PINNED)
  - dataColumns: `SPARE_PART_RAW_FIELDS` 매핑 (현 로직 유지)
  - **dynamicColumns 신설**: `fieldConfigRows` 중 RAW_FIELDS에 없고 메타(`id`,`project_id`,`raw_payload`,`custom_payload`,`row_version`,`is_active`,`source_upload_id`,`data_source_type`,`updated_by` 등)가 아닌 enabled 행 → accessor는 top-level 우선, 없으면 `raw_payload[original_header|field_name]` → `custom_payload[...]` 순
- `allColumnIds`, `columnVisibility`(isFieldVisible 적용), `columnOrder`(sortFieldNames + pinned) 추가
- `useReactTable` state에 `columnOrder`, `columnVisibility` 포함

### C. (선택) Field Config 정합성
필요 시 추후 마이그레이션으로 `updated_at`/`created_at` 시스템 행 추가 가능. 본 작업에는 포함하지 않습니다.

## 검증
- 새로고침 시 **Item No, S/N Outline** 컬럼이 노출됨
- Admin → Field Config(Spare Part)에서 토글/순서/이름 변경 → realtime으로 Raw Data 테이블에 즉시 반영 (Defect와 동일 동작)
- 기존 정렬/필터/엑셀 export 동작 유지

진행해도 될까요?