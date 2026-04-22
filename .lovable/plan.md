
## 목표

Plan vs Actual — Breakdown 표의 **System 헤더**에 필터 버튼을 추가해, System 기준 행을 바로 필터링할 수 있게 하겠습니다.

필터 팝업 구성은 다음 순서로 배치합니다.

```text
System 헤더
  └─ 필터 버튼
      ├─ 텍스트 필터 입력창  ← 맨 위
      ├─ Clear 버튼
      └─ 실제 데이터 기반 System 선택 체크리스트
```

## 구현 계획

### 1. Dashboard에 System 필터 상태 추가

`src/pages/DashboardPage.tsx`에 Plan vs Actual System 탭 전용 필터 상태를 추가합니다.

```text
systemTextFilter: string
selectedSystemFilters: string[]
```

필터 조건은 아래처럼 함께 적용합니다.

```text
텍스트 필터: System label에 입력 텍스트가 포함되는 행
선택 필터: 체크된 System label에 해당하는 행
둘 다 있을 경우: AND 조건
```

### 2. 실제 데이터 기반 선택 옵션 생성

현재 표시 가능한 `bySystem` 데이터를 기준으로 System 목록을 생성합니다.

```text
bySystem rows → System label 목록 추출 → 중복 제거 → 알파벳/문자 순 정렬
```

따라서 선택 필터에는 실제 Plan vs Actual 표에 존재하는 System만 표시됩니다.

### 3. System 탭에 필터링된 rows 전달

System 탭에는 기존 `bySystem` 대신 필터링된 `filteredBySystem`을 전달합니다.

```tsx
<PlanActualTable
  rows={filteredBySystem}
  groupParam="system"
  groupHeader="System"
  ...
/>
```

다른 탭(Subcontractor, Sub-Sub, HDEC PIC, Team)은 기존 동작을 유지합니다.

### 4. System 헤더에 필터 UI 추가

`PlanActualTable`의 첫 번째 헤더 셀에서 `groupParam === 'system'`일 때만 필터 버튼을 표시합니다.

```text
System [filter icon]
```

필터 버튼 클릭 시 Popover가 열리고, 팝업 내부는 다음 순서로 구성합니다.

1. 텍스트 검색 input
2. Clear / 선택 개수 표시
3. System 체크박스 목록

텍스트 입력창은 요청대로 **맨 위**에 위치시킵니다.

### 5. 필터 활성 상태 표시

필터가 적용된 상태를 사용자가 바로 알 수 있도록 합니다.

```text
필터 없음: 회색 필터 아이콘
필터 적용됨: primary 색상 필터 아이콘
```

또한 선택된 System 개수를 작은 텍스트로 보여줍니다.

```text
3 selected
```

### 6. 필터 결과 없음 처리

System 필터 적용 후 표시할 행이 없을 경우 기존 “No data.” 대신 더 명확한 메시지를 표시하도록 조정합니다.

```text
No matching systems.
```

### 7. Excel Export 동작 정리

현재 선택 중인 Breakdown 탭이 System일 경우, Excel export도 화면에 보이는 `filteredBySystem` 기준으로 내보내도록 맞춥니다.

즉:

```text
System 탭 + 필터 적용 → 필터된 System 행만 Excel export
다른 탭 → 기존 export 유지
```

### 8. 레이아웃 안정성 유지

이전에 수정한 헤더/본문 스크롤 정렬 구조는 유지합니다.

필터 버튼 추가로 System 헤더 높이와 colgroup 너비가 흔들리지 않도록:

```text
System 컬럼 너비 유지
헤더 내부는 flex 정렬
Popover는 table layout에 영향을 주지 않음
```

## 기술 변경 범위

수정 대상 파일:

```text
src/pages/DashboardPage.tsx
```

추가로 사용할 기존 UI 컴포넌트:

```text
Input
Checkbox
Popover
PopoverContent
PopoverTrigger
Button
```

필요한 icon import:

```text
Filter
X 또는 Search
```

## 검증 항목

구현 후 아래를 확인하겠습니다.

1. Plan vs Actual → By System 탭에서 System 헤더에 필터 버튼 표시
2. 필터 팝업에서 텍스트 필터창이 맨 위에 표시
3. 텍스트 입력 시 System 행이 즉시 필터링
4. 체크박스 선택 시 선택된 System만 표시
5. 텍스트 필터와 선택 필터가 동시에 적용될 때 AND 조건으로 동작
6. Clear 버튼으로 모든 System 필터 초기화
7. 필터 적용 후에도 숫자 클릭 시 Raw Data 이동 로직 유지
8. 헤더와 본문 스크롤 정렬 상태 유지
9. System 탭 Excel export가 화면에 표시된 필터 결과 기준으로 동작
10. `npm run build`로 빌드 확인
