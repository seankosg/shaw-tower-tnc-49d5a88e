## 진단 — Punch Raw Data와 Defect Raw Data 격차

| 기능 | Defect Raw Data | Punch Raw Data |
|---|---|---|
| 컬럼별 필터 (multi-select / text / date-range / progress) | ✅ | ❌ |
| 헤더 필터 칩 + URL 필터 칩 | ✅ | ❌ |
| Global token search (콤마 = AND) | ✅ | ❌ (단순 substring) |
| 정렬 (Shift+Click 다중 정렬) | ✅ | ❌ (정렬 불가) |
| 컬럼 리사이즈 + 컬럼 가시성 | ✅ | ❌ |
| 정렬·필터·컬럼폭 localStorage 저장 + URL 파라미터 복원 | ✅ | ❌ |
| 행 선택 체크박스 + Select-all | ✅ | ❌ |
| **BulkEditBar — 다중 필드값 일괄 변경 / Reassign** | ✅ | ❌ |
| 일괄 Critical / Duplicate / Delete | ✅ | ❌ |
| Critical 인라인 토글 | ✅ | n/a (Punch에 is_critical 없음) |
| Active filter chip bar (URL + column filters) | ✅ | ❌ |

원인: `PunchRawDataPage`는 plain HTML `<Table>`로 구현되어 있고, TanStack React Table을 도입하지 않았습니다. BulkEditBar 인프라(`bulk-edit.ts`, `bulk-actions.ts`)도 `'punch'` entity를 모릅니다.

---

## 작업 범위

### 1. 공용 컴포넌트 추출 (재사용 위한 사전 정리)
- `src/components/raw-data/ColumnFilterDropdowns.tsx` 신규
  - `MultiSelectDropdown`, `TextFilterDropdown`, `DateRangeDropdown`, `ColumnFilterDropdown`을 `DefectRawDataPage`에서 추출 → export
  - `multiSelectFilterFn`, `textFilterFn`, `dateRangeFilterFn`, `progressFilterFn`, `tokenizeAnd`, `matchesAllTokens`, `EMPTY_TOKEN`도 동일 위치로 이동 후 두 페이지에서 import
  - DefectRawDataPage는 import만 교체 (동작 변경 없음)

### 2. Bulk 인프라에 'punch' 추가
- `src/lib/bulk-edit.ts`
  - `BulkUpdateRequest['table']` 유니언에 `'punch_items'` 추가
  - `logTableFor` → `'punch_change_log'`, `logIdField` → `'punch_id'` 분기 추가
- `src/lib/bulk-actions.ts`
  - `BulkEntity` 유니언에 `'punch'` 추가
  - 모든 분기(`getEditableScopeMap`, `applyBulkReassign`, `previewBulkDelete`, `applyBulkDelete`, `applyBulkDuplicate`)에 punch 케이스 분기
  - **Edit scope**: punch RLS는 defect와 동일 패턴(`has_any_role` + `d_superuser`+team)이므로 drawing 케이스의 클라이언트 사이드 role+team 검사 로직을 재사용 (RPC 신설 불필요)
  - **Soft delete**: drawing 패턴 그대로 `UPDATE punch_items SET is_active=false`
  - **Hard delete / Duplicate / Cascade preview**: drawing과 동등하게 클라이언트 사이드 처리(`punch_change_log`도 함께 제거). 신규 RPC 없이 처리 가능
- `src/components/raw-data/BulkEditBar.tsx` — entity 기본값 매핑에 `'punch_items' → 'punch'` 분기 추가
- `src/components/raw-data/BulkActionBar.tsx` 및 dialogs — `entity === 'punch'`에서도 정상 동작하도록 라벨/카피만 보강 (이미 entity-기반 분기 구조)

### 3. PunchRawDataPage 전면 재작성 (Defect 구조 미러)
**파일**: `src/pages/PunchRawDataPage.tsx`
- TanStack React Table 도입: `useReactTable`, `getCoreRowModel`, `getSortedRowModel`, `getFilteredRowModel`, `getFacetedRowModel`, `getFacetedUniqueValues`
- 상태: `sorting`, `columnFilters`, `globalFilter`, `searchInput`(debounced), `columnSizing`, `rowSelection`
- LocalStorage 키 `punch-raw-data-state-v1`로 sorting/columnFilters/globalFilter/columnSizing 저장·복원, URL 필터 우선 적용 (Defect 패턴 그대로)
- URL 파라미터 지원: `q`, `dateField`+`dateStart`+`dateEnd`, `health`, `ready`, 기타 punch 필드명 — 진입 시 columnFilters로 변환
- 컬럼 정의:
  - `__select` (Checkbox), `item_no` (피닝)
  - 데이터 컬럼: `PUNCH_FIELDS` 순회하면서 dataType별로 filterFn/meta 결정
    - `date` → `dateRangeFilterFn` + `filterType: 'date-range'`
    - `pct`, `number` → `textFilterFn` (또는 progress filter) + `filterType: 'text'`
    - `enum` (health/gate/proc) → `multiSelectFilterFn` + `filterType: 'multi-select'` + 기존 라벨 옵션
    - `text` → `multiSelectFilterFn` (낮은 카디널리티 enum-like 필드) 또는 `textFilterFn` (description류) — 기존 `inferFilterType` 활용
  - 동적 컬럼: `usePunchFieldConfig` 의 `is_enabled && !knownFields` 항목을 `inferFilterType`로 자동 분류
- Visibility: `isFieldVisible(field, roles)` 그대로
- Sticky header, column resizing, multi-sort (Shift+Click), facet 카운트 표기는 Defect와 동일
- Active URL filter chip bar + Active column filter chip bar — Defect의 마크업 그대로 복사
- Search 입력 300ms debounce → globalFilter, `globalDefectFilterFn` 동등 함수(`globalPunchFilterFn`)는 `PUNCH_RAW_SEARCH_FIELDS`(item_no, outstanding_work, location, level, subcontractor_name 등)로 정의
- Health/Pre-Eng 빠른 버튼은 그대로 유지하되 내부적으로 `setColumnFilters`로 매핑 (URL과 일관)

### 4. BulkEditBar 통합
- `bulkFields: BulkEditableField[]` 정의 (그룹별):
  - **Identity**: `location`, `level`
  - **Classification**: `team`, `work_type`, `category1`, `category2`
  - **People**: `subcontractor_name`, `subsub_name`, `hdec_pic_name`, `hdec_eng_name`
  - **Schedule**: `planned_start_date`, `planned_completion_date`, `actual_start_date`, `actual_completion_date`
  - **Pre-engineering**: `material_approval_status`, `material_procurement_status`, `drawing_approval_status`, `mos_approval_status` (enum select)
  - **Notes**: `remarks` (있는 경우)
- `<BulkEditBar selectedRows table="punch_items" entity="punch" exportColumns={[...]} fields={bulkFields} ...>` 마운트
- Apply 후 클라이언트 캐시 patch 함수 신규: `src/lib/punch-cache.ts`의 `patchPunchCacheLocal(ids, patch)` (defect-cache 패턴 미러). 단일 페이지 메모리 상태가 단순하므로 `setRows`로도 충분 — 별도 캐시 모듈 없이 페이지 내 `setRows` 직접 갱신으로 처리

### 5. 검증
1. 컬럼 헤더의 Filter 아이콘 클릭 → multi-select / text / date-range 드롭다운 동작
2. Shift+Click 다중 정렬, 컬럼 폭 드래그 후 새로고침 → 유지
3. 행 다중 선택 → BulkEditBar 등장 → 필드 선택 → 값 변경 → 토스트 + 표 즉시 반영
4. URL `?subcontractor=X&dateField=planned_completion_date&dateStart=2026-01-01` 진입 → 칩 + 컬럼 필터 적용
5. Defect Raw Data가 회귀 없이 동일 동작 (공용 컴포넌트 추출 후)
6. 빌드 통과

---

## 영향 범위
- 신규 파일 1개 (공용 필터 드롭다운)
- 수정 파일 5개 (`bulk-edit.ts`, `bulk-actions.ts`, `BulkEditBar.tsx`, `DefectRawDataPage.tsx`, `PunchRawDataPage.tsx`)
- DB 변경 **없음** (Punch RLS·change_log 인프라 이미 존재, drawing 패턴으로 클라이언트 사이드 권한 체크)
- Defect Raw Data는 import 경로만 바뀌고 동작은 그대로

## 범위 외 (별도 작업으로 분리 제안)
- `is_critical`은 Punch 도메인에 없으므로 인라인 Critical 토글은 미구현
- `delete_punches_cascade` RPC는 만들지 않고, Hard delete는 클라이언트 사이드 cascade(`punch_change_log` 정리 후 `DELETE`)로 처리. 향후 트랜잭션 보장 필요 시 RPC 추가 가능
