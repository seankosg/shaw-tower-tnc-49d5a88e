
## 목표

`/docs/warranty` Raw Data 페이지를 OMM Raw Data 페이지와 시각적/기능적으로 동등하게 재구성하고, ABD/OMM 레벨의 styled Excel export를 제공합니다.

## 변경 1 — Page UI (DocsWarrantyRawDataPage.tsx 1:1 OMM 포팅)

### 1A. 헤더 (OMM 패턴)
- 제목 + 한 줄 설명 좌측, 우측에 `[N / Total rows] [resub badge] [Import] [Export Excel]` 배치
- 기존 작은 텍스트 카운터 / Popover 기반 Export(All/Filtered/Selected) → **단일 버튼 + 다이얼로그**(View / Re-import 포맷 선택)

### 1B. 툴바 (OMM 패턴)
- 검색창 `min-w-[220px] max-w-sm flex-1` + 디바운스(300ms)
- `Select`: All rows / Resubmissions only / Hide resubmissions
- `Switch`: "Has rejected status only" (선택적 — Warranty 도메인 보조 토글; 사용자가 원치 않으면 제거)
- `Clear sort (N)` ghost 버튼 (sort 활성 시)
- 우측 hidden md:inline 팁 텍스트 ("Shift+Click = multi-sort, Filter icon = column filter")

### 1C. Filter chip 바
- `buildColumnFilterChips(table, columnFilters)` 사용 (기존 자체 chip 로직 대체)
- `bg-muted/30 border` 컨테이너 + ✕ 클릭 제거 + 우측 `Clear all` ghost

### 1D. 컬럼 시스템
- `__select` (체크박스 36px, 항상 보임)
- `cycle_progress` 컬럼 (이미 존재; OMM 패턴 유지)
- `__open` trailing 컬럼 (행 클릭 대신 명시적 `ExternalLink` 아이콘 → `/docs/warranty/:id`)
- 컬럼 visibility / order 모두 OMM처럼 `useDocsFieldConfig('warranty')` 의 `is_enabled`/`sortFieldNames` 로 결정 (`columnVisibility`, `columnOrder` 두 state 분리)
- 컬럼 resize 활성화 (`enableColumnResizing: true`, `columnResizeMode: 'onEnd'`, `defaultColumn: { minSize: 60, maxSize: 600 }`)
- `meta.label` 추가 (export에서 사용)
- `optionFields` 도입 — multi-select 컬럼의 옵션을 facet으로 미리 계산
- Multi-sort 활성 (`enableMultiSort`, shift+click)
- 컬럼 사이즈 dictionary `sizeByField` (item_no 90, category 130, warranted_item 260, dates 110, statuses 80, …)

### 1E. localStorage 상태 영속화
- `warranty-raw-data-state:{userId|anon}` 키로 sorting/columnFilters/columnSizing/globalFilter/resubFilter 저장 (500ms debounce)
- mount 시 state 복원, URL `?q=` / `?resub=` 우선 적용

### 1F. 가상 스크롤 + 고정 컬럼 view (OMM `OmmRawTableView` 1:1)
- 별도 `WarrantyRawTableView` 컴포넌트 분리
- `useFrozenColumnCount()` 훅 사용 (모바일=1, 데스크톱=user setting clamp 1..4) + `+1`(select)
- sticky frozen 컬럼: `position: sticky; left: stickyLefts[i]; zIndex: 1/3` + 마지막 frozen 컬럼에 `shadow-[2px_0_4px_-2px_hsl(var(--border))]`
- `<TopHorizontalScrollbar targetRef width frozenWidth />`
- truncate 셀 (`whitespace-nowrap px-3 py-2 text-xs`), row hover 하이라이트 (hoveredIndex), resub 행 `bg-muted/30`
- `<Table style={{ width: totalWidth, tableLayout: 'fixed' }}>` (이미 적용된 fix 유지)
- 헤더에 sort 인디케이터 + multi-sort 인덱스 + filter dropdown + resize handle

### 1G. Bulk action bar
- `OmmBulkActionBar` 는 `docs_omm` 하드코딩 → **신규 컴포넌트 `WarrantyBulkActionBar`** + **신규 lib `src/lib/warranty-bulk-actions.ts`** (기존 `omm-bulk-actions.ts` 미러)
- Warranty bulk fields: `category`, `team`, `subcontractor_name`, `hdec_pic_name`, `hdec_eng_name`, `warranty_period_years`(number), `acra_info_status`(select), 4 stage status (`draft_status`, `subcon_signing_status`, `hdec_signing_status`, `final_status`) + 모든 stage planned/actual dates, `remarks`(text)
- 1차 구현은 update + soft-delete만; duplicate(resubmission)는 후속 작업으로 stub 처리

### 1H. 로딩 / 빈 상태 메시지 OMM과 동일 텍스트 톤

## 변경 2 — Excel export (ABD/Docs 패턴)

신규 파일 `src/lib/warranty-excel-export.ts`:
- `xlsx-js-style` 사용 + `STYLE_TITLE / STYLE_META_LABEL / STYLE_META_VALUE / STYLE_HEADER / STYLE_DATA / setCell / setDateCell / DATE_NUMFMT` 재사용 (`@/lib/excel-export`)
- `DATE_FIELDS` 셋(이미 페이지에 있음)을 모듈 상수로 export
- `WARRANTY_REIMPORT_MARKER = '[Format: SHAW_WARRANTY_REIMPORT_V1]'`
- 시트 구성:
  1. 제목 행: `SHAW Warranty Deeds — Raw Data Export`
  2. 메타 행 5개: Exported / Source / Search / Filters / Sort
  3. 빈 행
  4. 헤더 행 (짙은 슬레이트 배경 + 흰 글씨 + 테두리)
  5. 데이터 행 (날짜 셀은 Excel serial + DATE_NUMFMT, 텍스트는 일반 스타일)
- Freeze pane: ySplit=8, xSplit=2 (item_no + category)
- 컬럼 폭 계산 `colWidthFor` (날짜 12, remarks 30, 기본 16…)
- Export modes:
  - **View**: 현재 visible 컬럼·필터·정렬 그대로 (`__select`, `__open`, `cycle_progress` 제외)
  - **Re-import**: 첫 컬럼에 `id`, `item_no`, `resubmission_seq` (식별자), 그 뒤 편집 가능 필드만, 시트명 `Warranty (Re-import)`, 제목 줄에 marker 표시
- 파일명 `SHAW_Warranty_view_YYYYMMDD_HHmm.xlsx` / `SHAW_Warranty_reimport_…`

페이지에서는 OMM의 export 다이얼로그와 동일한 RadioGroup UI ("Current view" / "Re-import ready") + `{rowCount} rows will be exported.` 안내.

## 기술 노트

- 이미 적용된 Table 컨테이너 fix(`flex flex-col max-h-… overflow-hidden` + `<Table style={{width, tableLayout:fixed}}>`)는 재사용 — 새 `WarrantyRawTableView` 안에 그대로 들어감
- WarrantyCycleProgress / Legend / StageProgressFilterDropdown / StatusBadge / 재제출 그룹핑(collapse) 등 Warranty 고유 로직은 100% 보존
- `OmmBulkActionBar`는 generic화하지 않고 **별도 컴포넌트**로 두는 것이 안전 (도메인 위험 분리)
- `App.tsx`, supabase migration 등 라우팅/DB 변경 없음

## 새 파일

- `src/components/raw-data/WarrantyBulkActionBar.tsx`
- `src/lib/warranty-bulk-actions.ts`
- `src/lib/warranty-excel-export.ts`

## 수정 파일

- `src/pages/docs/DocsWarrantyRawDataPage.tsx` (대규모 재작성)

## 검증

1. 헤더 카드 / 카운트 badge / Import·Export 버튼 OMM과 동일 시각적 톤
2. 검색 디바운스 정상, URL `?q=...` 동기화
3. resub Select / Clear sort 동작
4. Filter chip 바 ✕ 제거 + Clear all
5. Frozen columns + sticky shadow + TopHorizontalScrollbar 동기화
6. localStorage 새로고침 후 sort/필터/사이즈 복원
7. Bulk: 1+ 선택 → 액션바 노출 → category 변경 → DB 반영 + 옵티미스틱 UI
8. Export → View 모드 / Re-import 모드 각각 다운로드, 헤더 짙은 색·메타 행 표시, 날짜 셀 Excel date 서식
