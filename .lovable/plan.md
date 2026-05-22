# Punch Raw Data — sticky 컬럼 & 스크롤 로직을 Defect Raw Data와 동일화

현재 `PunchRawDataPage.tsx`의 테이블은 sticky 좌측 컬럼이 없고(헤더만 sticky-top), 단순 `overflow-auto` 컨테이너만 사용하며, 행 가상화 / 상단 미러 가로 스크롤바도 없습니다. 이를 `DefectRawDataPage.tsx`의 `DefectRawTableView` 와 동일한 구조로 통일합니다.

## 결과적으로 적용되는 동작

1. **좌측 sticky 컬럼**
   - 선택 컬럼(`__select`) 1개 + 사용자 설정값(`useFrozenColumnCount`, 1~4, 모바일은 1) 만큼 좌측 고정
   - 각 sticky 컬럼은 누적 left offset으로 `position: sticky` 적용
   - 마지막 sticky 컬럼은 오른쪽에 미세 그림자(`shadow-[2px_0_4px_-2px_…]`)
2. **상단 sticky 헤더 행**
   - 동일 `<table>` 내 헤더가 `[&>th]:sticky [&>th]:top-0 [&>th]:z-[2]` 로 세로 스크롤 시 고정
3. **단일 스크롤 컨테이너 + 미러 가로 스크롤바**
   - 본문 위에 `TopHorizontalScrollbar` (frozen 영역만큼 좌측 비워둠) 배치 → 본문 스크롤과 양방향 동기화
   - 컨테이너 높이 `max-h-[calc(100vh-220px)]`, `[scrollbar-gutter:stable]`
4. **행 가상화** (`@tanstack/react-virtual`, ROW_HEIGHT=36, overscan 12)
5. **sticky 셀 불투명 배경**
   - 행 상태(`health_status` critical/behind, hover, completed)에 맞춘 2-레이어 배경(불투명 base + 색상 tint)으로 비-frozen 영역 셀이 sticky 셀 뒤로 비치지 않게 처리
6. **컬럼 리사이즈 핸들 더블클릭 → auto-size**
   - `tableRef` 기반 DOM 측정 후 `columnSizing` 갱신 (Defect와 동일 로직)

## Punch 고유 매핑

- Defect의 "closed / overdue" 색상 기준 → Punch에서는:
  - 완료(연한 회색) = `actual_completion_date` 존재 또는 `completion_status` 가 done/complete/closed 류
  - 위험(연한 destructive 배경) = `health_status === 'critical' || 'behind'`
- Defect의 `getSourceOrigin` (HDEC/Aconex/system 헤더 색상)은 Punch에 해당 데이터 없음 → 미적용(기존 `bg-background` 유지)
- `__select`(선택 체크박스) + `item_no` 가 기본 첫 컬럼이므로 자연스럽게 sticky 대상에 포함됨

## 변경 파일 (단일)

`src/pages/PunchRawDataPage.tsx`

1. import 추가
   - `useVirtualizer` from `@tanstack/react-virtual`
   - `TopHorizontalScrollbar` from `@/components/raw-data/TopHorizontalScrollbar`
   - `useFrozenColumnCount` from `@/hooks/useAppSettings`
   - `useIsMobile` from `@/hooks/use-mobile`
2. `autoSizeColumn(columnId)` 헬퍼 추가 (Defect와 동일)
3. 컬럼 리사이즈 핸들에 `onDoubleClick` 연결
4. 테이블 렌더 블록(현 `<div ref={tableRef} className="flex-1 overflow-auto …">` 영역)을 신규 내부 컴포넌트 **`PunchRawTableView`** 로 추출
   - `frozenCount`, `stickyLefts`, `frozenWidth`, `totalWidth` 계산
   - 헤더/셀 sticky 스타일 적용 + 마지막 sticky 컬럼 그림자
   - `useVirtualizer` 로 가상화, 위/아래 padding `<tr>` 삽입
   - hover index state로 sticky 셀 배경 보정
   - `<TopHorizontalScrollbar>` 본문 위 렌더
5. 기존 `renderHeader` 로직은 위 컴포넌트로 이동(중복 제거)
6. CSS 외 동작/필터/정렬/선택/Bulk Edit 로직은 변경 없음 (state 그대로 props로 주입)

## 기술 세부 (요약)

- frozenCount = `(isMobile ? 1 : clamp(frozenSetting, 1, 4)) + 1` (선택 컬럼 포함)
- 행 정렬·필터 상태는 외부 `table` 객체로 그대로 전달
- 가상화 도입으로 행 수 많아도 DOM 노드 수 일정 → 스크롤 성능 개선
- `tableRef` 는 가상화 스크롤 엘리먼트로 사용 (Defect와 동일)
