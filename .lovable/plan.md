

## Sticky/Scroll 컬럼 행 높이 불일치 수정

### 원인
- **Scroll pane** (우측): `rowVirtualizer.measureElement(el)`로 실제 DOM 높이를 측정하여 가변 높이 적용
- **Frozen pane** (좌측): `estimateSize: () => 36`(고정값)만 사용하고 `measureElement`를 호출하지 않음
- 우측 셀 내용이 길어서 행 높이가 36px을 초과하면, 좌측은 여전히 36px로 렌더링되어 스크롤 위치가 어긋남

### 수정 방법 (`src/pages/SubtestList.tsx`)

**Frozen pane의 각 행에 측정된 높이를 명시적으로 적용:**

1. Scroll pane의 `measureElement`가 측정한 실제 높이(`virtualRow.size`)를 Frozen pane 행의 `style.height`에 동기화
2. Frozen pane `<TableRow>`에 `style={{ height: virtualRow.size }}` 추가
3. Frozen pane `<TableCell>`에 `overflow-hidden` 추가하여 높이 초과 방지

```typescript
// Frozen pane row (약 1059행)
<TableRow
  key={row.id}
  data-index={virtualRow.index}
  style={{ height: virtualRow.size }}  // ← 추가: 측정된 높이 동기화
  className={cn(...)}
  ...
>
```

이렇게 하면 우측에서 측정된 실제 행 높이가 좌측에도 동일하게 적용되어 스크롤이 정확히 일치합니다.

### 수정 파일
- `src/pages/SubtestList.tsx` — Frozen pane `<TableRow>`에 `style={{ height: virtualRow.size }}` 1줄 추가

