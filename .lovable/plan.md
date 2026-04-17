

# 컬럼 너비 조정(Resize) + 사용자별 저장

## 1. 컬럼 리사이즈 활성화 (`src/pages/SubtestList.tsx`)

`@tanstack/react-table`의 내장 column sizing 기능 사용:

```ts
useReactTable({
  ...,
  columnResizeMode: 'onChange',
  enableColumnResizing: true,
})
```

각 컬럼은 이미 `size` 속성을 가지고 있으므로 초기 너비로 사용됨. `minSize`(60), `maxSize`(600) 추가.

## 2. 헤더에 리사이즈 핸들 UI

각 `<TableHead>` 우측 끝에 드래그 가능한 4px 핸들 추가:

```tsx
<TableHead style={{ width: header.getSize() }} className="relative ...">
  {/* 헤더 내용 */}
  <div
    onMouseDown={header.getResizeHandler()}
    onTouchStart={header.getResizeHandler()}
    onClick={(e) => e.stopPropagation()}  // 정렬 트리거 방지
    className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-transparent hover:bg-primary/40"
  />
</TableHead>
```

`<TableCell>`에도 `style={{ width: cell.column.getSize() }}` 적용 → 셀 너비도 헤더에 맞춰 변동.

테이블 전체에 `style={{ width: table.getTotalSize() }}` 적용해서 가로 스크롤 자연스럽게.

## 3. 사용자별 저장 (기존 localStorage 확장)

기존 `subtest-list-state:${user.id}` 키에 `columnSizing`을 함께 저장:

```ts
{
  sorting,
  columnFilters,
  globalFilter,
  columnSizing,  // 신규: { item_no: 100, system_code: 120, ... }
}
```

- `useState<ColumnSizingState>({})` 추가
- 마운트 시 localStorage에서 `columnSizing` 읽어 초기값으로 복원
- 변경 시 동일한 persist `useEffect`에 포함
- `useReactTable`에 `state.columnSizing` + `onColumnSizingChange: setColumnSizing` 연결

## 4. UX 디테일

- 리사이즈 핸들 호버 시 시각 피드백 (border-primary 색)
- 드래그 중에는 `table-layout: fixed` 효과를 위해 헤더/셀 모두 `width` style 직접 지정
- "Reset view" 버튼이 없으니, 정렬 활성화 시 노출되는 "Clear sort" 옆에 컬럼 너비도 초기화하는 옵션은 이번에는 추가하지 않음 (요청 시 별도 작업)

## 변경 파일

| 파일 | 변경 |
|------|------|
| `src/pages/SubtestList.tsx` | `enableColumnResizing` 활성화, 헤더에 리사이즈 핸들 추가, `<TableHead>`/`<TableCell>`에 width 스타일, `columnSizing` state 추가 + localStorage persist 확장 |

