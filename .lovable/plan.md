

# 헤더 리사이즈 핸들 더블클릭 → 컬럼 자동 너비 조정

## 동작
헤더 우측 리사이즈 핸들을 **더블클릭**하면, 해당 컬럼의 모든 셀(헤더 + body)의 실제 콘텐츠 너비를 측정해서 가장 긴 값에 맞춰 자동으로 폭을 조정. Excel/Google Sheets와 동일한 UX.

## 구현 방식 (`src/pages/SubtestList.tsx`)

### 1. 컬럼 ID → DOM ref 매핑
`TableBody`에서 각 셀에 `data-column-id={cell.column.id}` 속성 추가.
헤더 셀에도 `data-column-id={header.column.id}` 추가.
테이블 컨테이너에 `ref` 부착.

### 2. 자동 사이즈 측정 함수
```ts
const autoSizeColumn = (columnId: string) => {
  const container = tableRef.current;
  if (!container) return;
  const cells = container.querySelectorAll<HTMLElement>(`[data-column-id="${columnId}"]`);
  let max = 60; // minSize
  cells.forEach(cell => {
    // 측정용 임시 span 생성: cell의 실제 텍스트 너비를 padding 포함해 계산
    const clone = cell.cloneNode(true) as HTMLElement;
    clone.style.cssText = 'position:absolute; visibility:hidden; width:auto; white-space:nowrap; max-width:none;';
    document.body.appendChild(clone);
    const w = clone.getBoundingClientRect().width;
    document.body.removeChild(clone);
    if (w > max) max = w;
  });
  const finalWidth = Math.min(Math.ceil(max) + 16, 600); // padding buffer + maxSize cap
  setColumnSizing(prev => ({ ...prev, [columnId]: finalWidth }));
};
```

> 핵심: cell이 `truncate`/`max-width`로 잘려 있어도, clone에서 `white-space:nowrap; max-width:none`로 풀어 실제 콘텐츠 너비를 측정.

### 3. 핸들에 onDoubleClick 부착
```tsx
<div
  onMouseDown={header.getResizeHandler()}
  onTouchStart={header.getResizeHandler()}
  onDoubleClick={(e) => { e.stopPropagation(); autoSizeColumn(header.column.id); }}
  onClick={(e) => e.stopPropagation()}
  className="...(기존)... cursor-col-resize"
  title="Drag to resize, double-click to auto-fit"
/>
```

### 4. 사용자별 저장
이미 `columnSizing`이 localStorage에 persist되므로 자동 사이즈 결과도 그대로 저장됨 — 추가 작업 없음.

## 변경 파일
| 파일 | 변경 |
|------|------|
| `src/pages/SubtestList.tsx` | 테이블 컨테이너 `ref` 추가, 헤더/셀에 `data-column-id` 속성 추가, `autoSizeColumn` 함수 구현, 리사이즈 핸들에 `onDoubleClick` 핸들러 부착 + `title` 툴팁 |

