

## Field Config 순서 이동 기능 추가

### 목표
Admin > Field Config 탭에서 각 필드의 표시 순서를 변경할 수 있도록 하고, 변경된 순서가 SubtestList(컬럼 순서)와 SubtestDetail(필드 순서)에 실제로 반영되도록 합니다.

### 현재 상태
- `field_config.sort_order` 컬럼은 이미 존재 (integer, default 0)
- `useFieldConfig` 훅이 `sort_order`를 가져오고 있지만 활용 안 됨
- `FieldConfigTab()`은 단순 리스트로 표시, 순서 변경 UI 없음
- `SubtestList`: 컬럼 순서가 코드에 하드코딩됨
- `SubtestDetail`: 필드 순서가 JSX 구조로 하드코딩됨

### 변경 방안

**1. Admin UI — 순서 변경 컨트롤 (`AdminPage.tsx` > `FieldConfigTab`)**
- 각 행에 `↑` / `↓` 버튼 추가 (단순/직관적, 모바일 친화)
- `sort_order` 기준으로 정렬하여 표시
- 위/아래 버튼 클릭 시 인접한 두 행의 `sort_order` 값을 swap (DB UPDATE 2건)
- 첫 행은 `↑` disable, 마지막 행은 `↓` disable
- 드래그앤드롭은 의존성 추가 필요 + 모바일 UX 복잡 → 단순 버튼 방식 채택

**2. Hook 정렬 (`useFieldConfig.ts`)**
- 쿼리에 `.order('sort_order', { ascending: true })` 추가
- 정렬된 `field_name` 배열을 노출하는 `orderedFieldNames` 헬퍼 추가

**3. SubtestList 컬럼 순서 반영 (`SubtestList.tsx`)**
- TanStack Table의 `columnOrder` state 사용
- `field_config`의 `sort_order`에 맞춰 `columnOrder` 계산
- 항상 표시되는 키 컬럼(`system`, `item_no`, `subtest_id`, `mos_code`)은 항상 맨 앞 + `stage_progress`는 마지막 고정 (기존 UX 유지)
- 나머지는 config 순서대로 배치

**4. SubtestDetail 필드 순서 반영 (`SubtestDetail.tsx`)**
- 현재는 카드(섹션)별 JSX 하드코딩 구조 → 카드 단위 재정렬은 큰 리팩터 필요
- **MVP 범위**: 카드 내부 필드 순서는 유지하되, "Additional Fields" 같은 자유 필드 영역만 `sort_order`로 정렬. (이 부분은 Detail 페이지 구조 확인 후 정확히 결정 — 가능하면 이번에 적용, 불가하면 List만 적용 후 후속으로)

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/hooks/useFieldConfig.ts` | `sort_order` 정렬 + `orderedFieldNames` 노출 |
| `src/pages/AdminPage.tsx` | `FieldConfigTab`에 ↑↓ 버튼 + swap 로직 추가 |
| `src/pages/SubtestList.tsx` | `columnOrder` state로 컬럼 순서 동적 적용 |
| `src/pages/SubtestDetail.tsx` | (가능 범위에서) sort_order 적용, 또는 후속 처리 |

DB 스키마 변경 없음 (sort_order 컬럼 이미 존재).

### 기술 메모
- Swap 시 두 UPDATE를 `Promise.all`로 병렬 실행 후 `loadFields()` 재호출
- 동일 `sort_order` 충돌 방지: 초기 로드 시 sort_order가 모두 0이면 인덱스로 1회 normalize (선택)
- SubtestList 키 컬럼 고정 정책은 `useFieldConfig`의 `ALWAYS_VISIBLE_FIELDS`와 동일한 의도 유지

