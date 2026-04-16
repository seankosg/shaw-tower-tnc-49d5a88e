

# SubtestList 테이블 개선 계획

## 요청 사항
1. 페이지네이션 제거 → 모든 데이터를 하나의 스크롤 테이블에 표시
2. 각 컬럼별 필터 추가 (헤더 아래 필터 행)
3. 다중 필터 동시 적용 가능

## 변경 내용 (`src/pages/SubtestList.tsx`)

1. **페이지네이션 제거**
   - `getPaginationRowModel` import 및 사용 제거
   - `initialState.pagination` 제거
   - 하단 페이지네이션 UI (ChevronLeft/Right, Page X of Y) 제거
   - `limit(500)` → 전체 데이터 로드 (limit 제거, 또는 충분히 큰 값)
   - Supabase 1000행 제한 대응: 1000건 이상이면 반복 fetch (range pagination)

2. **컬럼별 필터 추가**
   - TanStack Table의 `getFilteredRowModel` + `columnFilters` state 활용
   - `ColumnFiltersState` 추가
   - 기존 상단 systemFilter/statusFilter 제거 → 컬럼 헤더 필터로 통합
   - 헤더 아래에 필터 행 추가: 각 컬럼에 텍스트 Input 또는 Select 드롭다운
     - **텍스트 필터**: Item No, Equipment, Subtest ID, MOS Code, Description, Predecessor, Subcontractor, HDEC PIC
     - **Select 필터**: System (시스템 목록), T1 Status / T2 Status (TC_STATUS_OPTIONS), Source (DataSource enum)
   - 각 컬럼의 `filterFn` 설정 (텍스트: includes, select: exact match)

3. **글로벌 검색은 유지** (상단 검색바)

4. **테이블을 `max-h-[calc(100vh-200px)] overflow-auto`** 스크롤 컨테이너로 감싸고, 헤더를 sticky로 고정

## 수정 파일
- `src/pages/SubtestList.tsx` — 위 변경 사항 모두 적용

