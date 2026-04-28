# Raw Data 필터 옵션 동적 연동 (Cross-Filtered Options)

## 문제

T&C(`SubtestList.tsx`)와 Defect(`DefectRawDataPage.tsx`)의 Raw Data 그리드에서 컬럼별 필터 Pulldown 옵션이 **항상 전체 데이터(`items` / `data`)** 를 기준으로 만들어집니다. 따라서 다른 컬럼에 필터를 걸어도 Pulldown에는 현재 행과 무관한 값까지 모두 보입니다.

예: Subcontractor를 "A"로 거른 상태에서 HDEC PIC Pulldown을 열면, A와 무관한 PIC도 모두 표시됨.

## 목표 동작 (Excel/AG-Grid 스타일)

각 필터 Pulldown은 **자기 자신을 제외한 다른 모든 활성 필터를 적용한 행** 을 기준으로 unique 값 목록을 생성합니다.

- 자기 컬럼 필터를 제외하는 이유: 그렇지 않으면 한 번 좁히고 나면 다시 다른 값을 추가 선택할 수 없게 됨.
- 이미 선택했지만 현재 다른 필터로 인해 행이 0개인 값은 옵션 목록에 **유지** 하고 옅은 회색으로 표시 (선택 해제 가능하도록).

## 구현 방식

TanStack Table의 `getFacetedUniqueValues()` 와 `column.getFacetedUniqueValues()` 를 사용하면 위 동작이 표준으로 지원됩니다. 현재 두 페이지는 자체 `optionFields` / `*Options` 배열을 컬럼 `meta.filterOptions` 로 주입하고 있어 정적입니다. 이를 다음과 같이 교체합니다.

### 1) Table 인스턴스에 faceted unique values 활성화

`useReactTable({...})` 호출에 추가:
```ts
import { getFacetedUniqueValues, getFacetedRowModel } from '@tanstack/react-table';

useReactTable({
  ...,
  getFacetedRowModel: getFacetedRowModel(),
  getFacetedUniqueValues: getFacetedUniqueValues(),
});
```

기본 `getFacetedRowModel` 은 "현재 컬럼을 제외한 다른 필터가 적용된 행" 을 자동으로 반환합니다 — 정확히 우리가 원하는 동작.

### 2) `MultiSelectDropdown` 이 옵션을 column 으로부터 직접 계산

현재 시그니처:
```ts
function MultiSelectDropdown({ column, options }: { column; options: {value,label}[] })
```

변경:
- `options` prop은 **labels 매핑(team→TEAM_LABELS 등)** 용 또는 정적 옵션(예: classification_source) 의 fallback 으로만 사용.
- 실제 후보 값 집합은 `column.getFacetedUniqueValues()` (Map<value, count>) 에서 도출.
- 표시 로직:
  1. faceted Map의 key 들 + 현재 선택된 값들의 합집합으로 candidate set 구성.
  2. 각 항목에 count 표시 (옵션 라벨 우측에 `(12)`).
  3. count === 0 (선택은 됐지만 다른 필터로 가려진 값) 인 항목은 muted 스타일로 표시.
  4. 정렬: count 내림차순 → 라벨 오름차순. (또는 라벨 오름차순 단일.)
- `(EMPTY)` 토큰 처리: faceted map에서 빈 값(`null`/`''`)을 EMPTY_TOKEN 으로 정규화하여 카운트.

### 3) 라벨 매핑 헬퍼

team 같은 enum 컬럼은 value→label 매핑이 필요하므로, `meta.filterOptions` 를 Map으로 변환해 라벨 lookup 으로 사용합니다 (옵션 source 가 아닌 label dictionary 역할).

```ts
const labelMap = useMemo(
  () => new Map(options.map(o => [o.value, o.label])),
  [options],
);
const display = (v: string) => labelMap.get(v) ?? v;
```

### 4) 정적 옵션 컬럼은 그대로 동작

`classification_source` 처럼 데이터에 없어도 보여야 하는 enum 컬럼은 `options` prop의 값을 candidate 합집합에 추가하면 됩니다 (이미 위 step 2.1 의 union 처리로 커버됨).

### 5) Sticky 좌측 컬럼 필터에도 적용

좌측 frozen 영역의 컬럼 헤더 필터도 동일 `MultiSelectDropdown` 컴포넌트를 쓰므로 자동 적용됨. 추가 작업 없음.

## 변경 파일

- `src/pages/SubtestList.tsx`
  - `useReactTable` 에 `getFacetedRowModel`, `getFacetedUniqueValues` 추가
  - `MultiSelectDropdown` 내부에서 `column.getFacetedUniqueValues()` 기반 옵션 생성으로 교체
- `src/pages/DefectRawDataPage.tsx`
  - 동일한 두 변경 적용 (해당 파일에도 유사한 `MultiSelectDropdown` 이 있음, line 199)
- (선택) Defect/T&C에서 공통 `MultiSelectDropdown` 을 `src/components/raw-data/MultiSelectDropdown.tsx` 로 추출하여 중복 제거. 이번 변경 범위가 동일하므로 함께 추출 권장.

## 영향 범위 / 비영향

- 정렬·가상 스크롤·sticky 컬럼 레이아웃: 영향 없음.
- BulkEdit 의 select option(`optionFields` / `subcontractorOptions`): **변경 없음** — 일괄 수정 시에는 모든 가능한 값을 보여줘야 하므로 기존 정적 옵션 유지.
- Export 페이지 (`DefectExportPage` 등) 의 필터 Pulldown: 본 작업 범위 외 (별도 페이지). 필요 시 후속 작업.

## 결과

다중 필터를 걸수록 각 컬럼의 Pulldown 후보가 자동으로 좁혀지고, 옵션 옆에 매칭 행 수가 표시되어 사용자가 의미 있는 선택만 수행할 수 있게 됩니다.
