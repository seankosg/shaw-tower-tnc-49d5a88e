
## 문제

`/docs/warranty` 페이지에서 데이터(140건)는 정상 import 됐는데도 화면에 헤더/행이 전혀 안 보입니다(가로 스크롤바와 검색바만 표시). 단순 로딩 지연이 아니라 **테이블 컨테이너가 0 사이즈로 격리되어 렌더링되지 않는 문제**입니다.

## 원인 (DocsWarrantyRawDataPage.tsx)

세 요인이 겹쳐 발생:

1. **`style={{ contain: 'strict' }}`** — `contain: strict`는 `size`까지 격리하므로 자식 `<Table>`의 intrinsic width/height가 부모 레이아웃에 기여하지 못함. 부모는 max-height만 있고 explicit height/flex 가 없어 결과적으로 컨테이너가 0 높이로 잡힘.
2. **불필요한 wrapper `<div ref={tableScrollRef}>`** 가 `<Table>`을 한 번 더 감싸 sticky header를 깨고 layout을 더 좁게 만듬.
3. **`<Table>` 에 explicit width / `tableLayout: fixed` 미설정** — TanStack column `size`는 자동으로 적용되지 않음. 정상 동작하는 OMM 페이지는 `<Table style={{ width: totalWidth, tableLayout: 'fixed' }}>` 로 지정.

정상 동작하는 `DocsOMMRawDataPage.tsx` 의 컨테이너 구조와 비교하면 이 차이가 명확합니다.

## 수정 계획 (단일 파일)

`src/pages/docs/DocsWarrantyRawDataPage.tsx` 약 771–835 줄의 Table 블록을 OMM 페이지와 동일한 패턴으로 교체:

```text
<div className="flex max-h-[calc(100vh-260px)] flex-col overflow-hidden rounded border bg-card">
  <TopHorizontalScrollbar targetRef={tableContainerRef} width={table.getTotalSize()} />
  <div ref={tableContainerRef} className="min-w-0 flex-1 overflow-auto scrollbar-hide">
    <Table style={{ width: table.getTotalSize(), tableLayout: 'fixed' }}>
      <TableHeader …sticky…>…</TableHeader>
      <TableBody>… (virtualizer 그대로) …</TableBody>
    </Table>
  </div>
</div>
```

구체적 변경:
- `style={{ contain: 'strict' }}` 제거
- 내부 wrapper `<div ref={tableScrollRef}>` 제거 (및 미사용된 `tableScrollRef` 선언/`useRef` 정리)
- 외부 컨테이너를 `flex flex-col max-h-[…] overflow-hidden` 로 변경
- 스크롤 컨테이너에 `min-w-0 flex-1 overflow-auto` 적용
- `<Table>` 에 `style={{ width: table.getTotalSize(), tableLayout: 'fixed' }}` 추가
- 헤더 sticky 클래스는 OMM과 동일하게 `[&>th]:sticky [&>th]:top-0 [&>th]:z-[2] [&>th]:bg-background` 패턴으로 통일

가상 스크롤(`useVirtualizer`)·컬럼·필터·legend 등 다른 로직은 변경하지 않습니다.

## 검증

- 페이지 로드 시 헤더 행 + 140 rows 표시
- 가로 스크롤이 상단 스크롤바와 동기화
- sticky header 가 세로 스크롤 시 고정
- Field Config 토글 시 컬럼 표시/숨김 정상 동작
