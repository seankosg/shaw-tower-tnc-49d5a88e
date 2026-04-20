

## Excel 틀고정 방식으로 재구현 — Frozen Pane + Scrolling Pane 분리

### 사용자가 원하는 것 (재정의)
Excel의 "틀 고정"처럼:
1. 좌측 3개 컬럼은 **물리적으로 가로 스크롤 영역 밖에** 위치 — 가로 스크롤바가 **고정 컬럼 아래에는 절대 그려지지 않음**
2. 가로 스크롤바는 **스크롤되는 우측 영역의 바닥에만** 존재
3. 세로 스크롤은 두 패널이 **동기화**되어 함께 움직임 (헤더는 sticky top 으로 고정)
4. 가상 스크롤(virtualization)도 두 패널 모두에 동일 인덱스로 적용

지금까지의 `position: sticky` 단일 테이블 방식은 가로 스크롤바가 전체 컨테이너 너비에 그려져 좌측 영역까지 침범 → 엑셀 느낌 안 남.

### 해결 방안 — Two-Pane Split Layout

```text
+----[ rounded border container, max-h, overflow-hidden ]----+
| +---- frozen pane ----+ +-------- scroll pane --------+   |
| | Header (sticky top) | | Header (sticky top)         |   |
| |  Item│Prog│System   | |  Equip│Subtest│MOS│Desc│..  |   |
| |---------------------| |-----------------------------|   |
| | Row1 cells (3 cols) | | Row1 cells (rest)           |   |
| | Row2 ...            | | Row2 ...                    |   |
| | (vertical scroll    | | (vertical scroll, shared)   |   |
| |  hidden, synced)    | | (horizontal scrollbar HERE) |   |
| +---------------------+ +─── 가로 스크롤바 ──────────┘   |
+------------------------------------------------------------+
```

**작동 핵심**:
- 두 div가 flex 가로 정렬: `[FrozenPane | ScrollPane]`
- **FrozenPane**: `overflow: hidden` (자체 스크롤 없음, 너비 = 고정 3컬럼 합)
- **ScrollPane**: `overflow-x: auto, overflow-y: auto` — 가로 스크롤바가 **이 패널 바닥에만** 부착
- **세로 스크롤 동기화**: ScrollPane 의 `onScroll` 에서 FrozenPane 의 `scrollTop` 을 일치시킴 (또는 양쪽 ref 동기화)
- 두 패널 모두 동일한 `useVirtualizer` 결과(`virtualRows`, `paddingTop/Bottom`) 공유 — 같은 `getScrollElement: () => scrollPaneRef.current` 사용
- 각 패널은 독립된 `<Table>` 을 렌더하지만, react-table 의 leafCols 를 `slice(0, 3)` / `slice(3)` 로 분리해서 헤더·셀을 그림
- 헤더는 각 패널 내부에서 `sticky top: 0` (세로 스크롤 시 헤더 고정 유지)

### 구현 세부

**파일**: `src/pages/SubtestList.tsx` 의 `SubtestTableView` 컴포넌트만 재구성. `useReactTable` / 컬럼 정의 / 캐시 / 가상화 로직 모두 그대로.

```tsx
function SubtestTableView({ table, ... }) {
  const FROZEN_COUNT = 3;
  const leafCols = table.getVisibleLeafColumns();
  const frozenCols = leafCols.slice(0, FROZEN_COUNT);
  const scrollCols = leafCols.slice(FROZEN_COUNT);

  const frozenWidth = frozenCols.reduce((s, c) => s + c.getSize(), 0);
  const scrollWidth = scrollCols.reduce((s, c) => s + c.getSize(), 0);

  const scrollPaneRef = useRef<HTMLDivElement>(null);
  const frozenPaneRef = useRef<HTMLDivElement>(null);

  // Virtualizer attached to scroll pane (the source of truth for vertical scroll)
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollPaneRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  // Sync vertical scroll: scrollPane → frozenPane
  const handleScroll = () => {
    if (frozenPaneRef.current && scrollPaneRef.current) {
      frozenPaneRef.current.scrollTop = scrollPaneRef.current.scrollTop;
    }
  };

  return (
    <div className="rounded-md border max-h-[calc(100vh-220px)] flex overflow-hidden">
      {/* Frozen pane */}
      <div
        ref={frozenPaneRef}
        className="overflow-hidden border-r shadow-[2px_0_4px_-2px_hsl(var(--border))]"
        style={{ width: frozenWidth, flexShrink: 0 }}
      >
        <Table style={{ width: frozenWidth, tableLayout: 'fixed' }}>
          {/* Header: filter row + sort row, only frozen cols */}
          {/* Body: virtualRows.map with frozen cells only */}
        </Table>
      </div>

      {/* Scroll pane — horizontal scrollbar lives here, only here */}
      <div
        ref={scrollPaneRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto"
      >
        <Table style={{ width: scrollWidth, tableLayout: 'fixed' }}>
          {/* Header: filter row + sort row, only scroll cols */}
          {/* Body: virtualRows.map with scroll cells only */}
        </Table>
      </div>
    </div>
  );
}
```

### 처리해야 할 디테일

| 항목 | 해법 |
|---|---|
| **세로 스크롤 휠이 frozen pane 위에 있을 때** | `frozenPaneRef` 에 `onWheel` 핸들러로 `scrollPaneRef.scrollTop += e.deltaY` 위임 |
| **행 높이 일치** | 두 테이블 모두 동일 `virtualRow.size` 사용 + `tableLayout: fixed` + 동일 `py-2` 패딩. 추가 안전장치로 row index별 `measureElement` 결과를 양쪽에 적용 (단순히 두 테이블 모두 동일 가상 행 배열만 그리면 자연 동기화됨) |
| **헤더 두 줄(필터 행 + 정렬 행)** | 각 패널 내부에 `<TableHeader className="sticky top-0 z-20 bg-background">` 로 동일하게 |
| **로딩/빈 상태** | scroll pane 에서만 표시 (`colSpan={scrollCols.length}`), frozen pane 은 빈 본문 |
| **클릭→상세** | 두 패널의 같은 인덱스 행에 동일한 `onClick` 부여. 호버 효과는 row index 기반 `hoveredIndex` state 로 양쪽 동기화 (또는 `peer` CSS) |
| **컬럼 리사이즈** | 고정 컬럼 리사이즈 → `frozenWidth` 자동 재계산되어 frozen pane 너비 갱신 |
| **가상 행 높이 측정** | 두 패널 중 한 쪽(scroll pane)의 row 만 `measureElement` 호출 (이미 신뢰 가능한 측정값) |
| **컬럼 visibility/order 변경** | `leafCols` 가 자동 갱신되므로 frozen/scroll 분할도 자동 |

### 변경 요약

| 파일 | 변경 |
|---|---|
| `src/pages/SubtestList.tsx` | `SubtestTableView` 본문을 two-pane split 구조로 재작성. 기존 `position: sticky left` 로직(`stickyOffsets`, `getStickyStyle`, `stickyIdSet`, `lastStickyId`) 제거. 가상화/캐시/리사이즈/정렬/필터 로직은 그대로 |

### 위험 / 주의
- 두 테이블 행 높이가 어긋나면 시각적으로 깨짐 → `tableLayout: fixed` + 동일 패딩 + 동일 가상 사이즈로 보장. cell 안의 컴포넌트(StatusBadge, StageProgress 등)는 모두 고정 높이라 안전.
- 트랙패드/마우스 휠로 frozen pane 위에서 세로 스크롤 시 위임 핸들러 필수 (위 표 참조).
- DB / 다른 파일 변경 없음.

