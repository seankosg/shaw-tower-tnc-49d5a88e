## Goal
Defect Raw Data 페이지에서 사용자가 느끼는 “같은 행 정렬이 안 맞는다 / 정렬이 개선되지 않는다” 문제의 근본 원인을 제거합니다. 단순히 칩 표시만 고치는 것이 아니라, 대시보드 진입 시 정렬 상태와 좌/우 분할 테이블의 행 정렬 일관성까지 함께 바로잡습니다.

## Root cause
현재 문제는 한 가지가 아니라 두 가지가 겹쳐 보입니다.

1. 저장된 정렬 상태가 대시보드 진입 컨텍스트를 덮어씀
- `src/pages/DefectRawDataPage.tsx`에서 정렬 상태를 항상 `localStorage`에서 복원합니다.
- 그래서 대시보드 카드로 들어와도 사용자가 기대하는 “카드 기준 필터 + 기본 정렬”이 아니라, 이전 세션의 정렬이 그대로 살아남을 수 있습니다.
- 스크린샷의 `Clear sort (1)`은 실제로 활성 정렬이 남아 있다는 증거입니다.

2. Defect Raw Data의 분할 테이블 구현이 SubtestList보다 더 취약함
- 좌측 frozen pane과 우측 scroll pane을 별도 `<Table>`로 렌더링하면서, 같은 virtual row 인덱스를 공유해 동기화합니다.
- 그러나 현재 Defect 쪽은 scroll sync / spacer / pane scroll 처리 방식이 SubtestList와 다르고, frozen pane에 `overflow-y-auto` + `onScroll`까지 걸려 있어 미세한 vertical drift가 생길 여지가 큽니다.
- 사용자는 이것을 “같은 행의 정렬이 안 맞는다”로 체감합니다.

## Implementation plan
1. Defect Raw Data의 정렬 초기화 정책 재설계
- `source=dashboard` 또는 URL 기반 drill-down 진입 시에는 저장된 sort를 무조건 복원하지 않도록 변경합니다.
- dashboard 진입에서는 기본 정렬을 명확히 적용하고, URL filter 컨텍스트를 우선합니다.
- 필요하면 “사용자 수동 정렬”과 “드릴다운 기본 정렬”을 구분하는 작은 헬퍼를 둡니다.

2. 정렬 상태를 화면에 더 명확하게 드러내기
- 현재 active URL filters / active column filters 외에, 대시보드 진입 시 적용되는 기본 정렬을 사용자가 오해하지 않도록 sort summary 표현을 정리합니다.
- `Clear sort` 동작도 일관되게 맞춰, 기본 정렬로 돌아가는지 완전 초기화인지 의도를 분명히 합니다.

3. Defect Raw TableView를 SubtestList의 안정적인 패턴에 맞춰 정렬
- `DefectRawTableView`의 scroll/frozen/header 동기화 로직을 `SubtestTableView` 기준으로 재구성합니다.
- frozen pane의 vertical scroll 처리, spacer 높이, hover/row height 적용을 동일 패턴으로 맞춰 좌우 행 mismatch 가능성을 제거합니다.
- 특히 frozen pane이 자체 스크롤 이벤트로 다시 본문을 밀어내는 구조를 단순화합니다.

4. 정렬 안정성 보강
- 필요 시 tie-breaker가 없는 컬럼들에 대해 stable sort 관점에서 보조 정렬 기준을 검토합니다.
- 최소한 dashboard drill-down 기본 상태에서는 동일 값이 많은 컬럼 때문에 행 순서가 불안정하게 보이지 않도록 정책을 고정합니다.

5. 회귀 점검 범위
- Dashboard → Completion Done
- Dashboard → Remain Inspection
- 일반 직접 진입(`/defects/raw-data`)
- 컬럼 필터 + URL 필터 + 정렬 동시 적용
- 좌우 frozen/scroll pane에서 같은 행이 끝까지 맞는지 확인

## Files likely to change
- `src/pages/DefectRawDataPage.tsx`
- 필요 시 공통 헬퍼 분리: 정렬/드릴다운 상태 해석용 유틸 파일

## Technical details
- 현재 확인된 핵심 지점:
  - `baseSorting`이 항상 localStorage에서 복원됨
  - `source=dashboard`를 정렬 정책에 반영하지 않음
  - Defect의 `handleFrozenScroll` / `handleScroll` 구조가 SubtestList보다 복잡하고 drift 가능성이 있음
  - `Clear sort`가 Defect에서는 `DEFAULT_SORTING`으로, SubtestList에서는 `[]`로 동작해 UX 의미가 다름
- 수정 방향:
  - dashboard/source-aware sorting policy
  - split-table scroll sync refactor
  - deterministic fallback ordering

승인해주시면 위 방향으로 실제 코드를 수정하겠습니다.