
## 구현 계획: Defect Raw Data를 T&C Raw Data 방식으로 전환

Defect Raw Data 화면(`/defects/raw-data`)에 T&C Raw Data(`Subtest Master Database`)의 페이지 설정, 스크롤, 헤더 필터, 정렬, 컬럼 리사이즈, 상태 저장 방식을 그대로 적용하겠습니다.

핵심 요구사항:

```text
- Defect Raw Data도 T&C Raw Data와 동일한 table UX 적용
- 페이지 설정/필터/정렬/스크롤 상태 저장
- 헤더별 필터 dropdown 적용
- 헤더 클릭 정렬 및 Shift+Click 다중 정렬 적용
- 컬럼 리사이즈 및 double-click auto-fit 적용
- 대량 데이터 대응을 위한 virtualized scroll 적용
- 최초 기본 정렬: Issue No 오름차순
```

---

## 1. Defect Raw Data를 TanStack Table 기반으로 재구성

현재 `DefectRawDataPage.tsx`는 단순 HTML table + 수동 필터 구조입니다.

이를 T&C Raw Data와 동일하게 아래 구조로 변경합니다.

```text
useReactTable
getCoreRowModel
getSortedRowModel
getFilteredRowModel
useVirtualizer
columnFilters
columnSizing
columnVisibility
columnOrder
globalFilter
sorting
```

수정 대상:

```text
src/pages/DefectRawDataPage.tsx
```

---

## 2. 기본 정렬을 Issue No 오름차순으로 설정

페이지 최초 로딩 시 기본 정렬은 아래로 고정합니다.

```text
DEFAULT_SORTING = [{ id: 'issue_no', desc: false }]
```

동작 기준:

```text
- 저장된 사용자 정렬 상태가 없으면 Issue No ASC
- 사용자가 정렬을 변경하면 localStorage에 저장
- Clear sort 후에는 필요 시 기본 정렬로 돌아가도록 처리
```

DB fetch 자체도 안정성을 위해 `issue_no` 오름차순 기준으로 변경합니다.

```text
현재:
order('issue_no', ascending: false)

변경:
order('issue_no', ascending: true)
```

---

## 3. T&C Raw Data와 동일한 페이지 상태 저장

사용자별로 Defect Raw Data table 상태를 저장합니다.

저장 항목:

```text
- sorting
- columnFilters
- globalFilter
- columnSizing
- scrollTop
- scrollLeft
```

저장 key는 T&C와 충돌하지 않게 별도로 사용합니다.

```text
defect-raw-data-state:{userId}
defect-raw-data-state:{userId}:scroll
```

이를 통해 사용자가 Detail로 이동 후 Raw Data로 돌아와도 기존 위치와 필터 상태를 유지합니다.

---

## 4. Header 필터 UI 적용

T&C Raw Data의 헤더 필터 dropdown 컴포넌트를 Defect Raw Data에 맞게 적용합니다.

필터 타입:

```text
Text filter:
- issue_no
- subcontractor_issue_no
- subcontractor_issue_source
- area_location
- description
- remarks
- hdec_comments

Multi-select filter:
- team
- closure_status
- status
- subcontractor_name
- subsub_name
- hdec_pic_name
- area_type
- area_level
- main_trade
- sub_trade
- defect_type
- priority

Date range filter:
- planned_date
- target_date
- closed_date
- updated_at
- created_at
```

헤더에서 제공할 기능:

```text
- filter icon 표시
- 필터 활성 시 primary color 표시
- Empty only 옵션
- Clear / Clear all
```

---

## 5. Header 정렬 UI 적용

T&C와 동일하게 헤더 클릭 정렬을 적용합니다.

```text
- Header click: 해당 컬럼 정렬
- Shift+Click: 다중 정렬
- ▲ / ▼ 아이콘 표시
- 다중 정렬 순서 표시
- Clear sort 버튼 제공
```

Issue No는 기본 오름차순으로 시작합니다.

---

## 6. 스크롤 및 Frozen Column 구조 적용

T&C Raw Data처럼 table을 두 pane으로 나눕니다.

```text
Frozen pane:
- Issue No
- Subcontractor Issue No
- Closure Status
- Team

Scrollable pane:
- 나머지 defect fields
```

모바일에서는 frozen column 수를 줄입니다.

```text
Desktop: 4개 frozen column
Mobile: 1개 frozen column
```

대량 데이터 성능을 위해 row virtualization을 적용합니다.

```text
ROW_HEIGHT = 36
overscan = 12
max height = calc(100vh - 220px)
```

---

## 7. Defect Field Config 반영 유지

기존에 구현된 `defect_field_config` 기반 컬럼 표시/순서를 유지하면서, TanStack Table의 `columnVisibility`, `columnOrder`로 반영합니다.

적용 기준:

```text
- issue_no는 항상 표시
- defect_field_config.is_enabled = false인 컬럼은 숨김
- defect_field_config.sort_order 기준으로 컬럼 순서 적용
- display_name을 header label로 사용
```

고정 컬럼은 앞쪽에 우선 배치하고, 나머지는 Field Config 순서를 따릅니다.

---

## 8. URL 필터 연동 유지 및 확장

Progress Matrix, Dashboard 등에서 Raw Data로 이동할 때 전달되는 query param 필터를 TanStack column filter로 변환합니다.

기존 지원 필터:

```text
team
subcontractor
subsub
hdecPic
level
mainTrade
subTrade
dateStart
dateEnd
q
```

추가/정규화할 필터:

```text
issueNo
subcontractorIssueNo
status
closureStatus
dateField
```

URL 필터가 있을 때는 T&C와 동일하게 상단에 active filter chips를 표시하고, 개별 제거 및 전체 제거를 지원합니다.

---

## 9. 검색 UI 및 records count 적용

T&C Raw Data와 동일한 상단 검색/상태 UI를 적용합니다.

```text
- Search icon 포함 global search input
- 검색 debounce 적용
- 현재 filtered records count 표시
- active column filter count 표시
- Clear filters 버튼
- Clear sort 버튼
- 사용 팁 문구 표시
```

검색 대상은 모든 주요 Defect 필드에 적용합니다.

```text
Issue No
Subcontractor Issue No
Subcontractor Issue Source
Team
Area
Trade
Description
Subcontractor
Sub-Subcontractor
HDEC PIC
Status
Remarks
```

---

## 10. Import / Export 버튼 유지

기존 Raw Data 상단의 Import 버튼은 유지하고, T&C Raw Data처럼 Export 진입 버튼도 함께 배치합니다.

```text
Import → /defects/import
Export → /defects/export
```

필요 시 현재 필터 상태를 Export 화면으로 전달할 수 있게 query param 유지도 검토합니다.

---

## 11. 구현 대상 파일

주요 수정:

```text
src/pages/DefectRawDataPage.tsx
```

필요 시 보조 수정:

```text
src/hooks/useDefectFieldConfig.ts
src/lib/defect-utils.ts
```

DB schema 변경은 필요 없습니다.

---

## 12. 검증 항목

```text
1. /defects/raw-data 로딩 시 Issue No 오름차순으로 표시됨
2. Header 클릭 정렬이 동작함
3. Shift+Click 다중 정렬이 동작함
4. Header filter dropdown이 컬럼별로 표시됨
5. Text / multi-select / date-range filter가 동작함
6. Empty only 필터가 동작함
7. Clear filters / Clear sort가 동작함
8. Global search가 동작함
9. Scroll 위치가 저장되고 복원됨
10. Column width resize가 동작함
11. Header double-click auto-fit이 동작함
12. Frozen columns와 horizontal scroll이 T&C Raw Data처럼 동작함
13. 대량 defect row에서도 virtualization으로 성능이 유지됨
14. Field Config visibility/order/display name이 유지됨
15. Progress Matrix 등에서 넘어온 URL 필터가 Raw Data에 반영됨
16. row 클릭 시 기존처럼 Defect Detail로 이동함
17. Import / Export 버튼이 정상 이동함
```
