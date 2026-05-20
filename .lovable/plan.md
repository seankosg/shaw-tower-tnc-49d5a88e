# Captured By — 그룹 탭 + 풀다운 필터 + % 표시

## 요구사항
- 각 사람 행에 **Completed %**, **Closure %** 추가 (숫자 옆 작은 회색).
- **컬럼 필터는 풀다운(체크박스) 형식** — 실제 데이터 값을 옵션으로 제공. 텍스트 입력형 폐기.
- **Group 컬럼 제거**. 대신 테이블 상단 헤더에 **탭 (All / Arch / Facade / MEP / Other)** 으로 그룹 필터.
- **Total 행을 데이터행들 최상단**에 고정 (sticky 첫 행).

## 수정 대상
`src/pages/DefectDashboardPage.tsx`의 `CapturedByStatsSection` 한 군데.

## 새 레이아웃
```text
[v] Captured By — Defect Statistics                17 persons · Unknown 418

 ┌────────────────────────────────────────────────────────────────┐
 │ [ All (17) ] [ Arch (3) ] [ Facade (2) ] [ MEP (8) ] [ Other ] │  ← 탭
 └────────────────────────────────────────────────────────────────┘

┌──────────────┬────────┬──────────────┬──────────────┬──────────┐
│ Name  ▾Filter│ Total ▼│ Completed    │ Closed       │ In Dispute│
├──────────────┼────────┼──────────────┼──────────────┼──────────┤
│ TOTAL (n=17) │  6 489 │  5 812  89%  │  3 102  48%  │    42    │  ← 합계행 (최상단, 강조)
├──────────────┼────────┼──────────────┼──────────────┼──────────┤
│ Penn Theen   │  3 655 │  3 262  89%  │  1 293  35%  │    10    │
│ Theepa V K   │    249 │    225  90%  │     20   8%  │     1    │
│ ...                                                             │
└──────────────┴────────┴──────────────┴──────────────┴──────────┘
✓ All totals reconcile ...
```

### 동작
- **그룹 탭**: 단일 선택 (All / Arch / Facade / MEP / Other). 각 탭 라벨에 해당 그룹 인원수 표시. 선택 시 해당 그룹 행만 표시. 탭 클릭 시 `onGroupClick(group)` 호출은 하지 않음 (단순 in-table 필터링).
- **Name 필터 풀다운**: 현재 표시 중인(탭 적용 후) 인물 목록을 체크박스로 다중 선택. Select all / Clear all 지원.
- **컬럼 정렬**: Name, Total, Completed, Closed, In Dispute 헤더 클릭 toggle. 기본 Total desc.
- **% 표시**: Completed/Closed 셀은 `숫자  ##%` 형식. `total === 0`이면 `—`. % 는 `Math.round(value/total*100)`.
- **Total 행**: 항상 데이터 행 최상단. 필터 적용 시 라벨 `TOTAL (n=k)` 로 표시. 배경 `bg-muted/40`, 굵게.
- **행 클릭 / 셀 클릭**: 기존 `onCardClick(name)` / `onMetricClick(name, metric)` 동작 유지.
- **접기/펼치기**: 기존 chevron 토글 유지.

### 보존
- Reconciliation 박스 유지.
- KPI props·콜백 시그니처 동일.

### 정리
- 기존 텍스트 Name 검색 input, Group multi-select Popover, Group 컬럼 및 셀, `groupTotals` 사용처 일부 — 모두 제거/대체.
- `MiniMetric` 미사용 상태 유지.

## 검증
- All 탭일 때 TOTAL 행 = reconciliation 합계와 일치.
- 그룹 탭 전환 시 TOTAL 행이 그룹 합계로 갱신.
- Name 풀다운 옵션은 현재 탭 안에서만 나옴.
- % 가 total=0 인 경우 — 로 표기.
- 모바일 가로 스크롤 OK.
