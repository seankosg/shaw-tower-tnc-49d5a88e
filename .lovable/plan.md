## 변경 내용

테이블에서 날짜 컬럼을 **내림차순(최신 → 과거)** 으로 표시하도록 변경합니다. Average 컬럼 바로 오른쪽에 가장 최신 날짜가 위치하고, 신규 DMR import가 들어오면 자연스럽게 Average와 기존 최신 컬럼 사이에 삽입됩니다.

## 적용 범위

- 영향: 테이블(Pivot 테이블 + ProductivityTable)
- 차트(Daily Manpower by Trade/Workplace): 시간축은 좌→우(과거→최신) 관례를 유지하기 위해 **변경하지 않음**

## 구현 세부

`src/pages/analysis/DmrDashboardPage.tsx`:

- `dates` (line 194)는 현재 오름차순으로 정렬되어 차트와 테이블 양쪽에 사용 중
- `dates`는 그대로 두고, 테이블 전용으로 `tableDates = [...dates].reverse()` 를 별도 `useMemo`로 생성
- 하단 Pivot 테이블 렌더링(`dates.map`, `dates.flatMap`) 부분을 `tableDates` 로 치환
- `ProductivityTable` 및 `ProductivitySummaryCards` 의 `dates` prop도 `tableDates` 로 전달  
  (집계 합계는 순서와 무관하므로 카드 수치 영향 없음)
- 합계/평균 계산용 `rowTotal`, `dayTotalByDate` 등은 정렬과 무관하므로 그대로 둠

`src/components/analysis/ProductivityTable.tsx`:

- 별도 수정 불필요 — 받은 `dates` prop 순서대로 렌더링되므로 자동 적용

`src/components/analysis/ProductivitySummaryCards.tsx`:

- 별도 수정 불필요 — 집계만 수행

## 결과

- 테이블 헤더: `Average | (최신) | … | (가장 과거)`
- 신규 데이터 import → 새 날짜가 자동으로 Average 바로 오른쪽에 추가됨
- 차트는 기존과 동일하게 좌→우 시간 진행 유지
