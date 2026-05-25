## 원인 분석

직전 변경에서 계층적 기본 정렬을 위해 추가한 다음 코드가 freeze 원인으로 추정됩니다.

```ts
state: { sorting: isDefaultSort ? [] : sorting, ... }
```

- 매 렌더마다 **새로운 `[]` 배열 참조**가 생성되어 react-table 내부에서 sorting state 변경으로 인식 → `getRowModel()` 재계산 → 재렌더 → 다시 새 `[]` → 잠재적 렌더 루프 / 메인 스레드 점유.
- 결과적으로 UI는 그려지지만 클릭·스크롤·정렬 핸들러가 응답하지 못함(메인 스레드 busy).

또한 사용자가 item_no 헤더를 클릭해도 `state.sorting=[]` → react-table은 "새 정렬 시작"으로 처리 → `[{item_no, asc}]` 호출 → 실제 `sorting` 상태와 동일 → React가 bail-out → 정렬 동작 안 함처럼 보이는 부수 효과도 있음.

## 수정 방안 (PunchRawDataPage.tsx 만 수정)

react-table에 정렬 책임을 떠넘기지 않고, **데이터 메모 단계에서 한 번에 정렬**한 뒤 `manualSorting: true`로 두는 방식으로 단순화합니다. 이러면 더 이상 `state.sorting`을 가짜로 비울 필요가 없습니다.

### 변경 1 — `orderedRows` useMemo 확장

`isDefaultSort` 분기와 사용자 정렬 분기를 모두 처리:

```ts
const orderedRows = useMemo(() => {
  // 1) 기본(아무 정렬 없음 또는 item_no asc) → 계층적 정렬
  if (isDefaultSort) {
    // (기존 로직: roots를 comparePunchItemNo, 자식은 planned_start_date asc nulls last, 고아는 끝)
    return out;
  }
  // 2) 사용자가 다른 정렬을 적용 → 평탄 정렬 (계층 무시)
  const arr = [...filteredRows];
  arr.sort((a, b) => {
    for (const s of sorting) {
      const va = (a as any)[s.id];
      const vb = (b as any)[s.id];
      // null/undefined는 항상 끝으로
      const aEmpty = va === null || va === undefined || va === '';
      const bEmpty = vb === null || vb === undefined || vb === '';
      if (aEmpty && bEmpty) continue;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      let c: number;
      if (s.id === 'item_no') c = comparePunchItemNo(va, vb);
      else if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
      else c = String(va).localeCompare(String(vb));
      if (c !== 0) return s.desc ? -c : c;
    }
    return 0;
  });
  return arr;
}, [filteredRows, isDefaultSort, sorting]);
```

### 변경 2 — `useReactTable` 옵션 수정

```ts
const table = useReactTable({
  data: orderedRows,
  columns,
  state: { sorting, globalFilter, columnFilters, columnSizing, columnVisibility, columnOrder, rowSelection },
  // ↑ sorting은 trick 없이 그대로 전달 (헤더 ▲/▼ 인디케이터용)
  manualSorting: true,   // ★ 추가: react-table이 다시 정렬하지 않음
  onSortingChange: setSorting,
  ...
});
```

`getSortedRowModel()` 호출은 그대로 두어도 무방하나(manualSorting=true면 데이터 순서를 그대로 통과시킴), 깔끔히 유지합니다.

### 변경 3 — (선택) 안전 가드

- `orderedRows` 내부에서 `usedChildKeys` 대신 `for (const [k, arr] of byParent)`에서 `if (rootIds.has(k)) continue;` 형태로 명시화하여 가독성 향상(필수 아님).

## 영향 범위

- PunchRawDataPage.tsx 1 파일만 수정.
- DB/타입/기타 페이지 변경 없음.
- Summary 자동 집계 트리거 및 PunchDetailPage 변경은 그대로 유지.
- 계층적 기본 정렬, 사용자 컬럼 정렬 모두 정상 동작 + freeze 해결.

## 검증

- 페이지 진입 시 Loading→데이터 표시 후 헤더 클릭으로 정렬 토글, 행 클릭으로 상세 진입, 가로/세로 스크롤이 모두 응답하는지 확인.
- 기본 상태에서 부모(Summary/단독) 뒤에 자식이 `planned_start_date` 오름차순(NULL 마지막)으로 표시되는지 확인.
- 다른 컬럼으로 정렬 시 계층 무시하고 평탄 정렬되는지 확인.
