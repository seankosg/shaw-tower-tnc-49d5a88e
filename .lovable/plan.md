## 진단

대시보드 카드/스테이지 클릭 → Raw Data로 이동할 때 `?status=`, `?overdue=`, `?stage=`, `?team=`, `?trade=` 같은 drill-down URL 파라미터가 붙음. Raw Data는 이를 받아서 `dashboardItems` / `tableData`로 행을 좁히지만, **localStorage에 저장된 column filters / sorting / global search가 그대로 살아있어서** 두 필터가 AND로 합쳐짐.

→ 사용자 체감: "대시보드 숫자(예: Done 120건)와 Raw Data 결과(예: 17건)가 안 맞음", "기존 필터가 리셋되지 않고 합쳐짐".

T&C(`SubtestList.tsx` L622~712)는 이미 `SUBTEST_DRILLDOWN_PARAMS` 배열로 drill-down URL 파라미터 진입을 감지해 저장된 column filters/sorting/global을 폐기하는 로직이 있음. ABD/OMM/Warranty Raw Data에는 동일 로직이 없음.

## 변경 (3개 파일)

각 페이지 내 localStorage 복원 useEffect를 다음 패턴으로 정렬 (T&C와 동치):

```ts
const DOCS_DRILLDOWN_PARAMS = [
  'status','overdue','stage','team','trade','q',
  // OMM/Warranty 전용 추가: 'mismatch','resub'
];
const isDrilldown = DOCS_DRILLDOWN_PARAMS.some(p => searchParams.has(p));

// localStorage 읽은 후:
if (!isDrilldown) {
  // 기존처럼 sorting/columnFilters/globalFilter 복원
} else {
  // sorting=DEFAULT, columnFilters=[], globalFilter='' 강제
  // columnSizing은 유지 (UX)
}
```

### 1) `src/pages/docs/DocsRawDataPage.tsx`
- 파라미터 목록: `status, overdue, stage, team, trade, q`
- 545~572 줄 useEffect 안에서 isDrilldown 분기 추가
- deps에 이미 `searchParams` 포함되어 있어 OK

### 2) `src/pages/docs/DocsOMMRawDataPage.tsx`
- 파라미터 목록: `status, overdue, stage, team, q, mismatch, resub`
- 587~626 줄 useEffect 안에서 isDrilldown 분기 추가
- deps에 `searchParams` 추가 필요 (현재 `[storageKey]`만 있음 → `[storageKey, searchParams]`)
- isDrilldown일 때 mismatchOnly/resubFilter는 URL 값으로만 결정 (이미 처리되고 있음)

### 3) `src/pages/docs/DocsWarrantyRawDataPage.tsx`
- 파라미터 목록: `status, overdue, stage, team, q` (+ Warranty가 mismatch/resub 사용 시 추가)
- L576 부근 동일 패턴, deps에 `searchParams` 보장

## 동작 결과
- 대시보드 카드/스테이지 클릭 → Raw Data 진입 시 column filter/sort/global search가 깨끗이 초기화되고 URL drill-down 필터만 작용
- 사용자가 직접 Raw Data로 들어오면(URL 파라미터 없음) 기존처럼 저장된 필터 복원
- "Clear" 버튼으로 dashboard 필터 제거 후엔 그 시점 컬럼 필터를 그대로 사용 (현재 동작 유지)

## 범위 외
- 대시보드 카드의 숫자 산식 변경 없음 (이미 `summariseByItem`/`computeStageProgress` 사용 — Raw Data와 동일 데이터 소스)
- 모바일/Defect/T&C 변경 없음
- DB / 권한 변경 없음
