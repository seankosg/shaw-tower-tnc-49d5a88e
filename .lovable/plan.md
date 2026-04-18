

## Subtest Master DB 첫 3개 컬럼 좌우 스크롤 시 고정 (Sticky Columns)

### 요구사항
좌우 스크롤(가로) 시 첫번째, 두번째, 세번째 컬럼을 왼쪽에 고정시키기. 세로 스크롤 시 헤더는 이미 sticky 처리되어 있음.

### 구현 방안

`SubtestList.tsx` 의 헤더(`TableHead`)와 셀(`TableCell`) 렌더링 시, 현재 컬럼이 `table.getVisibleLeafColumns()` 기준 인덱스 0, 1, 2면 sticky 스타일을 적용:

- `position: sticky`
- `left: <누적 width>` — 0번째는 0, 1번째는 col0.size, 2번째는 col0.size + col1.size
- `z-index` — 헤더는 기존 sticky top과 결합되므로 더 높은 값 (`z-20`), 본문 셀은 `z-10`
- 배경색 명시 (sticky 컬럼은 뒤 셀이 비치지 않도록 `bg-background`, hover/zebra 색상 보존을 위해 inline style로 처리하거나 부모 row 배경 상속용 클래스 적용)
- 마지막(3번째) 고정 컬럼 우측에 얇은 구분선 (`border-r`) 추가 — 스크롤 경계 시각화

### 핵심 로직 (의사 코드)

```ts
const leafCols = table.getVisibleLeafColumns();
const STICKY_COUNT = 3;
const stickyOffsets = leafCols.slice(0, STICKY_COUNT).reduce<number[]>((acc, col, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + leafCols[i - 1].getSize());
  return acc;
}, []);

// 헤더/셀 렌더 시
const colIndex = leafCols.findIndex(c => c.id === header.column.id);
const isSticky = colIndex < STICKY_COUNT;
const stickyStyle = isSticky ? {
  position: 'sticky',
  left: stickyOffsets[colIndex],
  zIndex: isHeader ? 20 : 10,
  background: 'hsl(var(--background))',
} : undefined;
```

### 주의사항
- `bg-background` 강제 적용 시 행 hover/delayed/done 색상이 가려짐 → sticky 셀의 배경을 행 상태별로 동기화하거나, `bg-inherit` + `TableRow`에 배경 클래스 적용으로 해결
- 컬럼 visibility/order 변경 시 자동 재계산 (getVisibleLeafColumns 사용)
- 컬럼 리사이즈 시 offsets 자동 재계산

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/pages/SubtestList.tsx` | 헤더 행(필터 행 + 정렬 헤더 행) + 본문 셀에 sticky 좌측 고정 스타일 적용, sticky offset 계산 추가 |

DB / 다른 파일 변경 없음.

