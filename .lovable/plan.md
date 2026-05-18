# Summary of Work 칩 레이아웃 정리

## 목적
`CriticalLevelRowCard`의 메타 칩을 두 행으로 일관성 있게 정렬한다. "Main Cat" 통합 칩을 제거하고 카테고리별 개별 칩으로 분리, Pre-Eng는 하단 행의 첫 위치로 이동.

## 변경 사항 (`src/pages/PunchDashboardPage.tsx`, `CriticalLevelRowCard` 컴포넌트, 약 623–635행)

### 1. Main Cat 칩 제거 및 카테고리별 칩으로 분리
- 기존 `MetaChip label="Main Cat" value={catLabel}` 한 줄을 제거.
- 고정 3개 카테고리(`Material`, `Physical Work`, `Design`) 각각을 별도 `MetaChip`으로 렌더링.
- 값은 해당 카테고리의 개수(`summary.mainCategories`에서 이름으로 매칭, 없으면 `0`).
- 세 칩의 너비를 동일하게 적용(`min-w-[8.5rem]`)하여 일관된 디자인.
- `cats`, `topCats`, `extra`, `catLabel` 로컬 변수와 `Layers` 아이콘 임포트 정리.

### 2. 두 행 구조로 재배치
하나의 `flex-wrap` 행을 두 개의 행으로 분리:

```text
Row 1 (카운트):  [Items]  [Material]  [Physical Work]  [Design]
Row 2 (속성):    [Pre-Eng] [Earliest] [Latest]
```

- 두 행 모두 동일 칸 너비(`min-w-[8.5rem]` 또는 통일된 값)로 시각적 정렬.
- 각 행은 `flex flex-wrap items-center gap-2`로 감싸고, 상위 컨테이너는 `flex flex-col gap-2`.

### 3. 아이콘 매핑
- Material → `Package` 또는 기존 `Layers` 재사용
- Physical Work → `Wrench` 대신 `Hammer` 등 (Pre-Eng와 구분 위해 Pre-Eng는 `ShieldCheck`로 변경 검토)
- Design → `PencilRuler` 또는 `Compass`
- (이미 임포트된 lucide 아이콘 우선 사용, 부족하면 추가 import)

### 4. 영향 범위
- 시각적 정렬/라벨만 변경, 데이터·필터·라우팅 로직 변경 없음.
- `Overall Progress` 행은 그대로 유지.

## 확인 포인트
- 카테고리에 데이터가 없을 때 0으로 표기되는지
- 1050px 뷰포트에서 두 행이 깔끔하게 정렬되는지
