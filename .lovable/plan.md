## 문제 분석

T&C(`SubtestList.tsx`)와 Defect(`DefectRawDataPage.tsx`) Raw Data 그리드에서 발생하는 3가지 레이아웃 문제:

### 1. 가로 스크롤바 위치
현재 `TopHorizontalScrollbar`가 **컬럼 헤더 위**에 렌더링됩니다. 사용자는 헤더 아래에 위치하기를 원함.

```text
[현재]                          [원하는 모습]
┌─ Frozen ┬─ scrollbar ────┐    ┌─ Frozen ┬─ Header ───────┐
│ Header  │ Header         │    │ Header  │ Header         │
│         ├────────────────┤    │         ├─ scrollbar ────┤
│ rows    │ rows           │    │ rows    │ rows           │
└─────────┴────────────────┘    └─────────┴────────────────┘
```

### 2. 좌측 Sticky 컬럼 헤더와 우측 헤더 높이 불일치
스크롤바가 우측 영역 위에 12px를 추가하면서 우측 헤더가 좌측 헤더보다 12px 아래로 밀려, 두 헤더의 baseline이 어긋남.

### 3. Sticky 컬럼 행과 우측 스크롤 영역 행의 높이 불일치
- 좌측(Frozen): `style={{ height: virtualRow.size }}` 명시 적용
- 우측(Scroll): `ref={(el) => rowVirtualizer.measureElement(el)}` 만 적용, 명시적 height 없음
→ 우측이 자체 콘텐츠에 따라 높이가 달라져 좌/우 행 높이가 어긋남.

---

## 해결 방안

### A. 스크롤바를 헤더 **아래**로 이동
`TopHorizontalScrollbar`를 헤더와 분리하기 위해 우측 pane 구조를 변경:
- 우측 pane을 **(1) Header 영역 + (2) 스크롤바 + (3) Body 영역** 3단으로 분리
- Header는 자체 가로 스크롤되는 컨테이너에 두고, 스크롤바·body와 `scrollLeft`를 동기화
- Body의 native 가로 스크롤바는 숨김(`scrollbar-hide`) 처리해 위쪽 mirror 스크롤바만 사용

```text
┌──────────────────────────────────┐
│ FROZEN HEADER │ SCROLL HEADER    │  ← 같은 높이 (둘 다 단일 행)
├───────────────┼──────────────────┤
│               │ ▭ 가로 스크롤바  │  ← 우측에만 표시
│ FROZEN ROWS   ├──────────────────┤
│               │ SCROLL ROWS      │
└───────────────┴──────────────────┘
```

좌측 Frozen pane에는 스크롤바 자리만큼의 spacer(`<div style={{ height: 12 }} />`)를 헤더와 body 사이에 삽입해 행이 동일한 Y 위치에서 시작하도록 함.

### B. 좌/우 헤더 높이 동기화
- 양쪽 `TableHead`의 padding을 동일한 클래스(`h-9` 등)로 명시
- 우측 헤더 위에 스크롤바를 두지 않으므로 자연히 같은 높이가 됨 (A 해결로 함께 해결)

### C. 좌/우 행 높이 동기화
TanStack Virtual의 동적 measure는 한쪽 pane만 측정하면 다른 쪽이 어긋남. 두 가지 옵션 중 **옵션 1**을 적용:

**옵션 1 (권장)**: 우측 행에도 `style={{ height: virtualRow.size }}` 적용 + 측정은 우측에서 수행하고, 좌측은 그 측정 결과를 따라감.
- 측정 대상 셀은 콘텐츠가 가장 큰 우측으로 통일 (`measureElement` 우측 유지)
- 좌·우 모두 `style={{ height: virtualRow.size }}` 명시
- 셀에 `truncate` + `overflow-hidden`을 강화해 콘텐츠가 행 높이를 더 늘리지 못하도록 함
- `MetaCell` 등 멀티라인 콘텐츠는 `whitespace-nowrap` 적용

---

## 수정 대상 파일

1. **`src/components/raw-data/TopHorizontalScrollbar.tsx`**
   - `scrollbar-hide` 유틸 클래스 또는 인라인 CSS로 본 body 스크롤바를 숨길 수 있도록 보조 prop 추가 (선택)
   - 동작은 동일, 위치만 부모에서 변경

2. **`src/pages/DefectRawDataPage.tsx`** (1178-1226 라인 근처)
   - 우측 pane 레이아웃을 `Header → Scrollbar → Body` 순으로 재배치
   - Header를 별도 가로 스크롤 컨테이너로 감싸고 `scrollLeft` 동기화 (기존 `handleScroll` 로직에 헤더 ref 동기화 추가)
   - Body 컨테이너에 `overflow-x-hidden overflow-y-auto`로 변경 (가로는 mirror가 담당)
   - 좌측 Frozen pane에 12px spacer 추가
   - 우측 `TableRow`에 `style={{ height: virtualRow.size }}` 추가
   - 셀에 `whitespace-nowrap` 추가 보강

3. **`src/pages/SubtestList.tsx`** (1495-1648 라인 근처)
   - 위와 동일한 패턴으로 우측 pane 3단 분리
   - 좌측에 spacer, 우측 행에 명시적 height 적용

4. **`src/index.css`** (필요 시)
   - `.scrollbar-hide { scrollbar-width: none; } .scrollbar-hide::-webkit-scrollbar { display: none; }` 유틸 추가

---

## 기술 세부 (개발자용)

- 우측 pane 새 구조 (Defect/Subtest 동일):
  ```tsx
  <div className="flex min-w-0 flex-1 flex-col">
    {/* (1) Header - 가로 스크롤되지만 사용자에겐 숨김 */}
    <div ref={headerScrollRef} className="overflow-hidden border-b">
      <Table style={{ width: scrollWidth, tableLayout: 'fixed' }}>
        <TableHeader>...</TableHeader>
      </Table>
    </div>
    {/* (2) Mirror 스크롤바 */}
    <TopHorizontalScrollbar targetRef={tableRef} width={scrollWidth} />
    {/* (3) Body */}
    <div ref={tableRef} onScroll={handleScroll}
         className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
      <Table style={{ width: scrollWidth, tableLayout: 'fixed' }}>
        <TableBody>...</TableBody>
      </Table>
    </div>
  </div>
  ```
- `handleScroll`에 `headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft` 추가
- `TopHorizontalScrollbar`의 기존 양방향 sync 로직은 그대로 유지(헤더는 body 스크롤을 단방향으로 따라감)
- 좌측 Frozen pane은 헤더 직후 `<div style={{ height: 12 }} aria-hidden />` 삽입으로 우측 mirror 스크롤바 높이를 보정
- 가상화 행 높이 동기화: 양쪽 모두 `style={{ height: virtualRow.size }}` + 측정은 우측 한 곳에서만(`measureElement`)
