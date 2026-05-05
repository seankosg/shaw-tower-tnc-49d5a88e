
# OMM Raw Data — Full Parity Rewrite (Defect Raw Data 수준)

`DocsOMMRawDataPage.tsx`를 Defect Raw Data와 동등한 운영 도구로 전면 재작성합니다. 기존 `OmmStatusBadge`, `OmmCopyQuantityCell`, `docs-omm-status.ts` 로직은 그대로 재사용합니다.

## 1. 테이블 엔진 (P0)

- `@tanstack/react-table` + `@tanstack/react-virtual` 도입 (Defect와 동일 패턴).
- 컬럼 정의는 `useDocsFieldConfig('omm')` 결과로 **동적 생성**. 하드코딩된 컬럼 분기 제거.
- `SortingState` / `ColumnSizingState` / `ColumnFiltersState` / `RowSelectionState` / `VisibilityState` 전체 도입.
- 컬럼 헤더: 클릭 정렬 + 더블클릭 auto-size + 우측 리사이즈 핸들.
- `useFrozenColumnCount` 적용해 좌측 N개 컬럼 sticky.
- `TopHorizontalScrollbar` 상단 미러 스크롤.
- 행 가상화로 2000행 제한 해제 (전체 로드 + virtual window).

## 2. 필터 / 검색 (P0)

Defect와 동일한 4종 헤더 드롭다운:

- **MultiSelectDropdown** — `category_group`, `category`, `team`, `subcontractor_name`, `hdec_pic_name`, `hdec_eng_name`, `training_required`, `draft_response_status`, `final_response_status`, `current_stage`, `current_status` 등 enum/저카디널리티 필드. Faceted counts + Empty 토큰.
- **TextFilterDropdown** — `sn`, `section`, `work_trade_material`, `remarks` 등. AND-token (`,` 구분).
- **DateRangeDropdown** — `instruction_date`, `draft_planned_date`, `draft_actual_date`, `draft_response_date`, `final_planned_date`, `final_actual_date`, `final_response_planned_date`, `final_response_actual_date`.
- **NumberRangeDropdown** (신규, 작은 컴포넌트) — `pdf_required_qty`, `pdf_actual_qty`, `hardcopy_required_qty`, `hardcopy_actual_qty`. Defect의 progress filter 패턴 재활용.
- 추가 toggle 필터 (테이블 상단 툴바):
  - **Copy mismatch only** (기존 유지)
  - **Resubmissions only / Hide resubmissions**
  - **Overdue only** (planned_date 경과 + actual 미입력)
- 글로벌 검색은 디바운스 + AND-token. 검색 대상: `RAW_SEARCH_FIELDS_OMM` 신규 정의 (sn, section, work_trade_material, subcontractor_name, hdec_pic_name, hdec_eng_name, remarks, category, category_group).
- `buildColumnFilterChips`로 활성 필터 칩 + 전체 Clear.

## 3. 상태 영속화 (P0)

- `storageKey = omm-raw-data-state:${user.id}` 에 sorting/columnFilters/columnSizing/columnVisibility/globalFilter 저장 (Defect 패턴).
- URL `searchParams` 동기화: `q`, `group`, `mismatch`, `resub`, `overdue`.

## 4. 행 선택 + Bulk 작업 (P1)

- 좌측 select 컬럼 (체크박스, sticky).
- `BulkEditBar` (Defect와 동일 컴포넌트) 사용. OMM `bulkEditableFields` 정의:
  - 카테고리: `category_group`, `category`, `team`, `training_required`
  - 담당: `subcontractor_name`, `hdec_pic_name`, `hdec_eng_name`
  - 수량: `pdf_required_qty`, `pdf_actual_qty`, `hardcopy_required_qty`, `hardcopy_actual_qty` (number)
  - 일자: `instruction_date`, `draft_planned_date`, `draft_actual_date`, `draft_response_date`, `final_planned_date`, `final_actual_date`, `final_response_planned_date`, `final_response_actual_date`
  - 응답: `draft_response_status`, `final_response_status` (A/B/C/clear) — **트리거 발화 주의**: B/C 일괄 적용 시 다량 resubmission row 자동 생성 가능 → confirm 다이얼로그에 경고 문구.
  - 비고: `remarks`
- `BulkDeleteDialog`, `BulkDuplicateDialog` 통합 (`entity='omm'`). `BulkReassignDialog`는 OMM에는 sub-trade 개념이 약하므로 1차 범위에서 제외.
- Bulk Delete는 soft delete (`is_active=false`) 기본, hard delete는 admin 전용 (Defect와 동일 패턴).

## 5. Export (P1)

- 신규 `src/lib/docs-omm-excel-export.ts`:
  - `exportOmmRawToExcel(rows, { format: 'view' | 'reimport' })`
  - `exportOmmRawToExcelByCategory(rows)` — category_group별 시트 분할 (Defect의 per-subcon 대응)
  - `exportOmmRawToZipByCategory(rows)` — 7개 초과 시 ZIP
- 헤더의 Export 버튼 → Defect와 동일 형태의 Dialog (Single vs Per-Category, View vs Re-import, ZIP threshold=7).
- View 포맷: 현재 visible 컬럼 + 라벨. Re-import 포맷: `import_header_mappings`의 alias 헤더로 출력 → 그대로 재업로드 가능.

## 6. 메타 / 코멘트 / 시각화 (P2)

- `META_FIELD_NAMES` 컬럼군 추가 (`MetaCell` 그대로 사용): created_by, created_at, updated_by, updated_at, source_origin, source_file.
- **Comment summary 컬럼**: `omm_comments` 테이블에서 행별 집계 — 1회 쿼리로 `Map<row_id, CommentSummary>` 생성, `MetaCell field='comments'` 셀 클릭 시 Detail 페이지 이동(코멘트 섹션 앵커).
- **OmmCycleProgress mini-bar 셀** (신규 작은 컴포넌트): Pending Draft → Draft UR → Pending Final → Final UR → Approved 5단계 progress dot. Rejected는 빨강 점.
- **DDayBadge** 적용: 활성 stage의 planned date 기준. Overdue / At-risk 색.
- 행 강조: `is_resubmission` 음영 (기존 유지) + Overdue시 좌측 빨강 보더.
- 헤더에 `useLatestDocsDataDate` 표시.

## 7. 인라인 편집 / 액션

- 기존 Draft/Final response status select 인라인 편집 유지하되 `BulkEditBar`와 동일한 `applyBulkUpdate` 경로로 통일.
- 행 우측 액션: ExternalLink (Detail) + 코멘트 아이콘(요약 카운트 표시).
- 모바일(`useIsMobile`): 카드 리스트 fallback (Defect와 동일 패턴이지만 OMM은 1차로 horizontal scroll만 허용해도 됨 — 결정 필요).

## 8. 권한 가드

- `editableIds` 계산: subcontractor 역할은 본인 회사 행만 편집 가능 (Defect 패턴 차용). 그 외는 hdec_engineer 이상만 편집.
- Bulk 액션 버튼은 `editableIds.length > 0` 일 때만 활성.

## 9. 파일 변경

**신규**
- `src/lib/docs-omm-excel-export.ts` — 3개 export 함수
- `src/components/docs/OmmCycleProgress.tsx` — mini stage dots
- `src/components/raw-data/NumberRangeDropdown.tsx` — 헤더 숫자범위 필터 (재사용 가능하게 raw-data 폴더에 둠)
- `src/lib/omm-bulk-fields.ts` — `BulkEditableField[]` 정의 + `RAW_SEARCH_FIELDS_OMM`

**수정**
- `src/pages/docs/DocsOMMRawDataPage.tsx` — 전면 재작성 (~1500줄)
- `src/lib/field-filter-type.ts` — `'number-range'` 타입 추가 (Defect progress 필드도 호환되게)
- `src/lib/filter-chip-utils.ts` — number-range 칩 포맷 추가
- `src/components/raw-data/BulkEditBar.tsx` — 필요 시 `entity` prop으로 OMM 라벨 분기 (최소 변경)
- `src/components/raw-data/dialogs/BulkDeleteDialog.tsx`, `BulkDuplicateDialog.tsx` — `entity: 'omm'` 케이스 분기 (테이블명/라벨)

**미변경 (재사용)**
- `OmmStatusBadge`, `OmmCopyQuantityCell`, `docs-omm-status.ts`, `useDocsFieldConfig`, `TopHorizontalScrollbar`, `MetaCell`

## 10. 데이터 로딩

- 기존 단일 쿼리(2000 limit) → `fetchAllRows` 패턴으로 page-fetch (Defect와 동일).
- 코멘트 요약은 별도 쿼리 1회 (`select row_id, count(*), max(created_at)` group by row_id).
- 트리거 발화 후 갱신을 위해 mutation 후 `load()` 대신 낙관적 업데이트 + 백그라운드 refetch.

## 11. 범위 외 (이번 작업에서 다루지 않음)

- OMM Dashboard 위젯 (별도 페이즈)
- Resubmission 자동 이메일 알림
- Spare Part / Warranty / As-Built 페이지의 동일 패리티 (요청 시 동일 패턴 복제)
- 모바일 전용 카드 뷰 (1차에서는 horizontal scroll로 대응)

## 12. 검증

- 빌드/타입 체크 자동 수행.
- 수동 시나리오: 컬럼 정렬→필터→검색→bulk edit (response B로 5건 일괄)→resubmission row 자동 생성 확인→Export(view/reimport)→재업로드 round-trip.

승인하시면 위 계획대로 구현을 시작하겠습니다.
