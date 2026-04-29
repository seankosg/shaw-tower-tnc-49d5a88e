## 목표
T&C raw data(`src/pages/SubtestList.tsx`)의 행 정렬/헤더/스크롤바 문제를 한 번에 해결합니다. Defect Raw Data에서 시행착오 끝에 검증된 **단일 테이블 + sticky columns + sticky header 구조**를 그대로 이식합니다.

## Defect Raw Data 시행착오에서 얻은 교훈

검토 결과 Defect Raw Data는 다음 순서로 시행착오를 거쳤습니다.

1. 2-pane(좌 frozen / 우 scroll) 별도 테이블 → 행 높이 어긋남, 헤더 동기화 실패
2. spacer row로 상단 offset 보정 → top scrollbar(16px) vs spacer(12px) 불일치 누적
3. 단일 테이블 + sticky 도입 → 헤더가 sticky 안되거나 스크롤바가 frozen 영역까지 침범
4. **최종 수렴 구조**:
   - 단일 스크롤 컨테이너 1개가 가로/세로 스크롤을 모두 담당
   - 헤더는 같은 `<table>` 안에서 `position: sticky; top: 0`
   - frozen 컬럼은 헤더/바디 모두 `position: sticky; left: ...` (동일 좌표계 → 정렬 보장)
   - top scrollbar는 `frozenWidth` spacer로 frozen 영역 위에는 트랙이 안 보이게
   - sticky 셀 배경은 `linear-gradient(base, base)` 2단 레이어로 완전 불투명
   - z-index: 헤더 일반 2 / 헤더 frozen 3 / 바디 frozen 1
   - 셀 width/height는 명시적으로 고정(`width/minWidth/maxWidth`, `height/maxHeight`)
   - virtualizer scrollElement = 단일 스크롤 컨테이너

T&C의 현재 코드는 이 시행착오 중 **2번 단계**에 머물러 있습니다(spacer 12 vs scrollbar 16, 좌/우 별도 table). 그래서 부분 패치로는 절대 한 번에 안 끝납니다. **구조를 통째로 4번 단계로 교체**해야 합니다.

## 구현 계획

### 1) `SubtestList.tsx`의 `SubtestTableView` 전면 교체
현재 좌측 frozen pane / 우측 scroll pane 2개의 별도 `<Table>` 구조를 폐기하고, Defect Raw Data와 동일한 구조로 다시 짭니다.

구조:
```text
<div flex flex-col rounded border>
  <TopHorizontalScrollbar targetRef={tableRef} width={totalWidth} frozenWidth={frozenWidth} />
  <div ref={tableRef} overflow-auto scrollbar-hide>
    <Table style={{ width: totalWidth, tableLayout: 'fixed' }}>
      <TableHeader>
        <TableRow [&>th]:sticky [&>th]:top-0 [&>th]:z-[2] [&>th]:bg-background>
          {allHeaders.map(renderHeader)}   // frozen은 내부에서 z-3 + sticky left
        </TableRow>
      </TableHeader>
      <TableBody>
        {paddingTop spacer}
        {virtualRows.map(... 셀마다 frozen이면 sticky left + opaque bg)}
        {paddingBottom spacer}
      </TableBody>
    </Table>
  </div>
</div>
```

### 2) 핵심 파생값
- `frozenCount` = `(isMobile ? 1 : 4) + 1` (선택 컬럼 포함, 기존 정책 유지)
- `stickyLefts[i]` = 0..i-1 컬럼 width 누적합
- `frozenWidth` = 0..frozenCount-1 width 합
- `totalWidth` = 모든 leaf 컬럼 width 합
- `ROW_HEIGHT` = 36 유지

### 3) 헤더/바디 셀 공통 규칙
- 모든 `<th>`/`<td>`에 `width / minWidth / maxWidth` 명시
- 모든 `<td>`에 `height / maxHeight = ROW_HEIGHT` 강제 (행 높이 어긋남 원천 차단)
- frozen 셀: `position: sticky; left: stickyLefts[i]`
- frozen 마지막 컬럼: `shadow-[2px_0_4px_-2px_hsl(var(--border))]`로 시각적 경계
- frozen header: `z-3`, frozen body cell: `z-1`, 일반 header: `z-2`

### 4) Sticky 셀 배경 불투명 처리
Defect Raw Data와 동일하게 row 상태별 배경을 2단 레이어로:
```ts
const base = 'hsl(var(--background))';
const opaque = `linear-gradient(${base}, ${base})`;
if (isHovered)         return `${opaque}, hsl(var(--muted) / 0.95)`;
if (delayed && !t2Done) return `${opaque}, hsl(var(--destructive) / 0.06)`;
if (t2Done)            return `${opaque}, hsl(var(--muted) / 0.45)`;
return base;
```
이렇게 하면 우측 컬럼이 좌측 frozen 뒤로 비치지 않습니다.

### 5) 가상화 단일화
- `useVirtualizer`의 `getScrollElement = () => tableRef.current` 한 곳만 사용
- 기존 `frozenPaneRef` / `headerScrollRef` / `handleScroll` / `handleFrozenWheel` 전부 제거
- spacer row(`height: 12`) 등 수동 보정 제거 (구조적으로 불필요)

### 6) 기존 기능 보존
다음은 동작 그대로 유지합니다.
- 정렬/필터(`ColumnFilterDropdown`, multi-sort indicator)
- 컬럼 리사이즈 + 더블클릭 auto-fit
- row hover 강조, overdue/done row 클래스(`renderRowBgClass`)
- 행 클릭 시 `/subtests/:id` 라우팅 + `location.search` 유지
- loading / empty 상태 표시
- `bulk select` 컬럼이 항상 첫 frozen 컬럼으로 들어가는 정책

### 7) 영향 파일
- `src/pages/SubtestList.tsx` — `SubtestTableView` 함수 본문 재작성 (1440 ~ 1715 영역)
- `src/components/raw-data/TopHorizontalScrollbar.tsx` — **수정 없음** (Defect에서 이미 frozenWidth 지원)
- 기타 페이지 영향 없음

### 8) 검증 체크리스트 (수정 후 직접 점검)
- [ ] 첫 행이 좌/우 모두 같은 Y 위치에서 시작
- [ ] 가로 스크롤 시 frozen 컬럼이 흔들리지 않음
- [ ] 우측 텍스트가 frozen 컬럼 위로 비치지 않음
- [ ] top scrollbar 트랙이 frozen 영역을 침범하지 않음
- [ ] 세로 스크롤 시 헤더가 고정됨
- [ ] hover/overdue/done row 색상이 좌·우 일관
- [ ] 컬럼 리사이즈 후에도 정렬 유지
- [ ] 가상화로 빠르게 스크롤 시 행 높이 jitter 없음
- [ ] 모바일 뷰(`frozenCount` = 1+1)에서도 동일 동작

## 기대 결과
- T&C raw data 좌/우 행 시작점·행 높이·헤더 정렬이 처음부터 끝까지 일치
- frozen 영역 위로 다른 컬럼 텍스트 비침 제거
- top 스크롤바가 frozen 영역을 침범하지 않음
- Defect Raw Data와 T&C Raw Data가 동일한 검증된 코드 패턴을 공유 → 향후 한쪽만 어긋날 위험 제거

## 리스크와 대응
- **리스크**: `SubtestTableView` 본문이 큼(약 270줄) → 재작성 중 누락 가능
  - **대응**: 정렬/필터/리사이즈/bulk select/navigate 등 기존 기능을 위 체크리스트로 1:1 매핑하며 옮김
- **리스크**: 가상화 scrollElement 변경으로 첫 렌더 시 측정 타이밍 이슈
  - **대응**: Defect Raw Data가 동일 구조에서 안정 동작 중이므로 동일 패턴 그대로 사용
- **리스크**: Defect와 달리 T&C에는 헤더 그룹(`headerGroups`)이 다층일 수 있음
  - **대응**: 현재 코드도 `lastHeaderGroup`만 사용 중이므로 동일하게 마지막 그룹만 렌더