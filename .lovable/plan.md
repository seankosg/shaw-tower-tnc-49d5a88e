## 목표
T&C Raw Data(`SubtestList`)와 Defect Raw Data(`DefectRawDataPage`)에서 가로 스크롤바를 리스트 **하단** 대신 **헤더 바로 아래(테이블 영역 상단)** 에 항상 노출되게 하여, 화면을 아래로 스크롤하지 않아도 가로 스크롤이 가능하도록 합니다.

## 배경
- 현재 두 페이지 모두 `<div className="... overflow-auto">` 한 곳에서 가로/세로 스크롤을 모두 처리합니다. 브라우저는 horizontal scrollbar를 그 컨테이너의 **하단**에만 그릴 수 있습니다.
- viewport 높이가 작거나 행 수가 많으면 horizontal scrollbar가 화면 아래로 밀려, 사용자가 가로 스크롤을 인지하지 못합니다.
- 표준 해결책: **"미러 스크롤바"** — 실제 테이블과 동일한 가로폭만 가진 더미 div를 헤더 바로 아래에 sticky로 두고, 두 컨테이너의 `scrollLeft`를 양방향 동기화합니다.

## 동작 변경
- 테이블 우측 스크롤 영역 **상단(헤더 바로 아래)** 에 항상 보이는 얇은 horizontal scrollbar가 sticky로 표시됩니다.
- 사용자가 이 상단 스크롤바를 드래그하면 실제 테이블 영역도 같이 가로 이동합니다.
- 사용자가 아래로 스크롤해서 테이블 하단의 기본 horizontal scrollbar를 사용해도, 상단 미러 스크롤바도 동기화되어 움직입니다.
- frozen pane(좌측 고정 컬럼)과 scroll pane(우측 가변 컬럼)의 분리 구조는 그대로 유지됩니다.
- 세로 스크롤 동작은 변경 없음.

## 기술 구현

### 1) 새 공용 컴포넌트
- `src/components/raw-data/TopHorizontalScrollbar.tsx` 신규 생성.
  - props: `targetRef: React.RefObject<HTMLDivElement>`, `width: number`, `className?: string`.
  - 내부:
    - 자체 `ref`로 `<div className="overflow-x-auto overflow-y-hidden h-3 sticky top-0 z-30 bg-background border-b">` 를 렌더하고, 안에 `<div style={{ width }}>` 로 가로폭 제공.
    - `onScroll` 핸들러로 `targetRef.current.scrollLeft` 동기화.
    - `useEffect`에서 `targetRef`에 `scroll` 리스너를 달아 반대 방향 동기화. 무한루프 방지를 위해 `isSyncingRef` 플래그 사용.
    - `ResizeObserver`로 `width` 변경 시 자동 반영.
  - 시각: `h-3` (12px) 정도 얇게, `bg-muted/40` 트랙, native scrollbar 그대로 사용.

### 2) `DefectRawDataPage.tsx` (`DefectRawTableView` 내부, 약 1158번 줄 근처)
- scroll pane 컨테이너 직전 위치에 `<TopHorizontalScrollbar targetRef={tableRef} width={scrollWidth} />` 삽입.
- scroll pane 컨테이너의 sticky header(`<TableHeader className="sticky top-0 z-20 ...">`)의 `top` 값을 미러 스크롤바 높이(12px)만큼 내리거나, 미러 스크롤바를 scroll pane **외부 상단**(즉, 테이블 외곽 컨테이너 안쪽 / scroll pane 위)에 두는 방식 중 후자를 사용 — sticky header와 z-index 충돌을 피합니다.
- 구체적으로 외곽 컨테이너를 `flex flex-col`로 한 단 더 감싸지 않고, 기존 `flex` 가로 분할은 유지한 채 scroll pane 영역만 `flex-col` 로 감싸 `[TopScrollbar][Table]` 두 행으로 구성:
  ```
  <div className="flex flex-col min-w-0 flex-1">
    <TopHorizontalScrollbar targetRef={tableRef} width={scrollWidth} />
    <div ref={tableRef} className="min-w-0 flex-1 overflow-auto">
      <Table .../>
    </div>
  </div>
  ```
- frozen pane은 기존대로 좌측 별도.

### 3) `SubtestList.tsx` (`SubtestTableView` 내부, 약 1452/1528번 줄 근처)
- 동일한 방식으로 scroll pane을 `flex-col`로 감싸고 위에 `<TopHorizontalScrollbar targetRef={tableRef} width={scrollWidth} />` 추가.

### 4) 동기화 세부사항
- `scrollLeft` 양방향 동기화는 다음 패턴:
  ```ts
  const isSyncing = useRef(false);
  const onTopScroll = (e) => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    targetRef.current!.scrollLeft = e.currentTarget.scrollLeft;
    requestAnimationFrame(() => { isSyncing.current = false; });
  };
  // target → top 동기화도 effect에서 동일 패턴으로.
  ```
- frozen pane의 세로 동기화 로직(`handleScroll`, `handleFrozenWheel`)은 변경 없음.

### 5) 부수 효과 / 주의
- 새 미러 스크롤바가 약 12px의 세로 공간을 차지하므로, 테이블 외곽 `max-h-[calc(100vh-220px)]` 안에서 그만큼 scroll pane 가용 높이가 감소. 필요 시 외곽 max-h를 `calc(100vh-232px)` 로 12px 보정.
- 좌측 frozen pane 상단에는 미러 스크롤바가 필요 없으므로(가로 이동 없음), 동일 높이의 빈 placeholder div를 추가해 frozen header와 scroll header의 수직 정렬을 맞춥니다.
- 모바일 환경에서도 native scrollbar가 기본 노출되도록 별도 CSS 강제는 하지 않으나, 트랙 색상으로 시각적 가시성을 확보합니다.

## 영향 범위
- 신규 파일 1개: `src/components/raw-data/TopHorizontalScrollbar.tsx`
- 수정 파일 2개: `src/pages/SubtestList.tsx`, `src/pages/DefectRawDataPage.tsx`
- 데이터/스키마/RLS 변경 없음.

## 검증
- `/tc/raw-data` 직접 진입 및 `/tc/dashboard`에서 카드 클릭 후 진입 시, 헤더 아래에 미러 스크롤바가 sticky로 보이고 양방향 동기화 정상.
- `/defects/raw-data` 동일 검증.
- 컬럼 리사이즈/필터 변경 → `scrollWidth` 변경 시 미러 트랙 폭이 즉시 반영.
- 좌측 frozen 컬럼은 영향 없음, 세로 스크롤 동작 유지.