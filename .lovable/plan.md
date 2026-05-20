# Captured By — 표 형태 + 컬럼 필터 + 접기/펼치기

## 요구사항
- 그룹×인물 카드 격자가 정신 없으니 **단일 테이블**로 단순화.
- 컬럼별 필터 (Group, Name).
- 섹션 전체를 **접기/펼치기**.

## 수정 대상
`src/pages/DefectDashboardPage.tsx` 의 `CapturedByStatsSection` (≈ 699–837행) 한 군데만 변경.

## 새 레이아웃
```text
[v] Captured By — Defect Statistics              17 persons · Unknown 418
┌────────┬────────────────┬───────┬───────────┬────────┬────────────┐
│ Group  │ Name           │ Total │ Completed │ Closed │ In Dispute │
│ ▾Filter│ [search...]    │  ▼    │           │        │            │
├────────┼────────────────┼───────┼───────────┼────────┼────────────┤
│ Arch   │ Penn Theen     │ 3655  │ 3262      │ 1293   │ 10         │
│ Arch   │ Theepa V K     │  249  │  225      │   20   │  1         │
│ Facade │ Merlin Sesaiyan│  385  │  335      │   83   │  1         │
│ ...                                                                │
├────────┴────────────────┼───────┼───────────┼────────┼────────────┤
│ Filtered total (n)      │  ...  │   ...     │  ...   │   ...      │
└─────────────────────────┴───────┴───────────┴────────┴────────────┘
✓ All totals reconcile ...
```

### 동작
- **접기/펼치기**: 카드 헤더에 chevron 토글. 접으면 헤더(타이틀 + 인원수/Unknown)만 표시.
- **컬럼 정렬**: Group, Name, Total, Completed, Closed, In Dispute 모두 헤더 클릭으로 toggle (asc/desc). 기본 Total desc.
- **Group 필터**: 헤더에 Popover + 체크박스 다중선택 (Arch / Facade / MEP / Other), 각 항목 옆에 총 Total 카운트. Clear 버튼.
- **Name 필터**: 헤더에 인라인 텍스트 Input (부분일치, case-insensitive).
- **행 클릭**: Raw Data로 `capturedBy=<name>` 이동 (기존 동작 유지).
- **셀 숫자 클릭**: 기존 metric 필터 그대로 (Total/Completed/Closed/In Dispute).
- **Group 셀 클릭**: 해당 그룹으로 Raw Data 이동 (`capturedByGroup`).
- **합계 행**: 필터 적용 상태에 따라 "Filtered total (n)" / "Total (n)" 라벨로 표시.

### 보존
- Reconciliation 알림 박스(녹색/노랑)는 그대로 표 하단에 유지.
- KPI props·콜백 시그니처 동일 — 다른 파일 수정 불필요.
- `MiniMetric` 더 이상 안 쓰이지만 별도 정리는 안 함 (다른 곳에서 안 쓰는지 확인 후 제거).

### Hook 순서 안전
- 기존에 `if (stats.length === 0) return …` 뒤에 `useMemo` 있던 순서 버그도 같이 정리. 모든 hook을 early return 위로 이동.

## 검증
- Total/Completion/Closure/In Dispute 합계가 reconciliation row와 일치.
- Group 필터 + Name 필터 동시 적용 시 합계 행이 즉시 갱신.
- 접기 상태가 다른 액션(KPI 클릭 등)으로 초기화되지 않음.
- 모바일 가로 스크롤 OK (`overflow-x-auto`).
