## 목표
1. Raw Data 테이블에서 행을 선택하면 BulkActionBar에 **"Register to Critical Issue Board"** 액션이 활성화되어 선택한 행을 일괄 Critical 등록
2. 대시보드 하단의 `CriticalItemsPanel` 제목을 **"Critical Issue Board"** 로 변경하고, 권한이 있는 사용자가 보드 안에서 직접 Critical 해제(삭제) 가능
3. 보드 행에 추가 컬럼: **Main Trade · Sub Trade · Work Type** 표시 (Defect 전용; T&C 측은 해당 필드가 없으므로 표시 생략)

## 1) BulkActionBar — Register to Critical 액션 추가
파일: `src/components/raw-data/BulkActionBar.tsx`
- `table === 'subtests' | 'defect_items'` 인 경우 보조 액션 영역에 `AlertTriangle` 아이콘 + "Register to Critical Issue Board" 버튼 추가
- 클릭 시 `editableIds`(권한 있는 row만) 대상으로 `supabase.from(table).update({ is_critical: true }).in('id', editableIds)` 실행
- 결과 토스트(등록/권한없어 스킵 카운트), `onMutated()` 호출하여 부모 refetch
- `editableCount === 0` 또는 `overLimit` 시 disabled
- 이미 모두 `is_critical = true`인 경우는 그래도 멱등 처리(허용)

## 2) Critical Issue Board — 이름 변경 + 삭제(해제) 기능
파일: `src/components/dashboard/CriticalItemsPanel.tsx`
- 카드 헤더 타이틀 기본값을 **"Critical Issue Board"** 로 변경. 호출 측(`DashboardPage`, `DefectDashboardPage`)에서 굳이 title prop을 넘기지 않도록 정리
- 각 행 우측에 휴지통 아이콘 버튼(`Trash2`) 추가:
  - 클릭 → `e.stopPropagation()` → 확인 토스트 후 `supabase.from(table).update({ is_critical: false }).eq('id', row.id)`
  - 권한 체크: 클라이언트에서는 `useAuth`로 user 확인 + 행을 가져올 때 권한 결과를 활용. 서버측 RLS(기존 `subtests` / `defect_items` UPDATE 정책 = `can_update_*` / `can_write_for_team` / role allowlist)가 그대로 작동하므로 권한 없는 사용자가 시도하면 RLS 거부 → 토스트로 안내
  - guest 등 명시적으로 unauthenticated인 경우 버튼 hidden
- `onMutated?: () => void` prop 추가 → 호출 측에서 dashboard refetch 트리거. 그게 무겁다면 panel 내부에서 prop으로 받은 `items`를 즉시 로컬 필터로 제거하는 optimistic 갱신도 병행
- 추가 prop `tableName: 'subtests' | 'defect_items'` 로 어떤 테이블을 update 할지 결정

## 3) Main Trade / Sub Trade / Work Type 컬럼 추가 (Defect 측)
파일: `CriticalItemsPanel.tsx`, `DefectDashboardPage.tsx`
- `CriticalRowItem`에 옵셔널 필드 추가:
  ```ts
  main_trade?: string | null;
  sub_trade?: string | null;
  work_type?: string | null;
  ```
- 패널 props에 `showTradeColumns?: boolean` 플래그 추가 (T&C 패널은 false 유지, Defect 패널만 true)
- `showTradeColumns=true`일 때 테이블에 다음 3개 컬럼 헤더/셀을 secondary 다음에 삽입: **Main Trade**, **Sub Trade**, **Work Type**
- `DefectDashboardPage.tsx`에서 `defects` 배열을 `CriticalRowItem`으로 매핑할 때 `main_trade`, `sub_trade`, `work_type` 채워서 전달, `showTradeColumns` props=true 지정

## 범위 외
- T&C(Subtests)에는 main/sub trade, work_type 컬럼이 없으므로 해당 추가 컬럼은 표시하지 않음
- BulkActionBar의 "Unregister from Critical" 일괄 해제는 보드 안 개별 삭제로 충분. 향후 요청 시 추가
- DB 스키마 변경 없음 (기존 `is_critical` 컬럼 재사용)

## 기술 노트
- 등록/해제 후 일관성을 위해 `change_log` 트리거가 있다면 그대로 동작. 따로 audit 작성 코드 추가하지 않음
- 권한 검사는 모두 RLS에 위임 (낙관적 업데이트 후 에러 시 토스트 + revert)
- 보드 행 삭제 버튼은 group 헤더 옆이 아닌 각 row 마지막 컬럼에 배치
