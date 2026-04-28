# Defect Raw Data — 콤마 구분 AND 텍스트 필터

## 목표

Defect 시스템의 Raw Data 페이지(`/defect/raw`)에서 모든 **텍스트 입력형 필터**에 사용자가 콤마(`,`)로 여러 검색어를 구분해 입력하면, 모든 토큰을 **AND 조건**(대소문자 무시, 부분일치)으로 필터링합니다.

예: `slab, rebar` 입력 → 셀 텍스트가 `slab` **그리고** `rebar`를 모두 포함해야 매칭.

## 적용 범위

`src/pages/DefectRawDataPage.tsx` 내 텍스트 입력 기반 필터 3종:

1. **`textFilterFn`** — 모든 일반 텍스트 컬럼 (issue_no, description, area_location, subcontractor_name 등 `TEXT_FILTER_FIELDS`)
2. **`progressFilterFn`** — Progress(%) 컬럼 (planned/actual progress)
3. **`globalDefectFilterFn`** — 상단 전역 검색창 (RAW_SEARCH_FIELDS 전 필드 대상)

`multiSelectFilterFn`(Pulldown 필터)과 `dateRangeFilterFn`(날짜 필터)는 텍스트 입력이 아니므로 **변경 없음**.

T&C(`SubtestList.tsx`)는 사용자가 "Defect 시스템"만 명시했으므로 이번 범위 외.

## 동작 정의

- 입력 문자열을 콤마(`,`)로 split → 각 토큰 trim → 빈 토큰 제거.
- 토큰이 0개면 필터 비활성(전체 통과).
- 토큰이 1개면 기존과 동일(부분일치).
- 토큰이 2개 이상이면 **모든 토큰**이 대상 텍스트에 부분일치(case-insensitive)해야 통과 (AND).
- `emptyOnly` 체크박스는 기존 우선순위 그대로 유지.
- 콤마 자체를 검색하고 싶은 경우는 드물고 기존에도 콤마 검색은 의미가 없었으므로 이스케이프 문법은 도입하지 않음.

## 기술 변경

`src/pages/DefectRawDataPage.tsx`:

```ts
// 공용 헬퍼 추가 (파일 상단 utils 영역)
const tokenizeAnd = (text: string): string[] =>
  text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);

const matchesAllTokens = (haystack: string, query: string): boolean => {
  const tokens = tokenizeAnd(query);
  if (tokens.length === 0) return true;
  const lower = haystack.toLowerCase();
  return tokens.every((tok) => lower.includes(tok));
};
```

세 함수를 헬퍼 사용으로 교체:

- `textFilterFn`: `String(val).toLowerCase().includes(text.toLowerCase())` → `matchesAllTokens(String(val), text)`
- `progressFilterFn`: `formatPct(val).toLowerCase().includes(text.toLowerCase())` → `matchesAllTokens(formatPct(val), text)`
- `globalDefectFilterFn`: `RAW_SEARCH_FIELDS.some((f) => str.includes(text))` → `RAW_SEARCH_FIELDS.some((f) => matchesAllTokens(String(original[f] ?? ''), filterValue))`
  - 단, 전역 검색은 "어느 한 필드라도 모든 토큰을 포함" 의미 (필드 across OR, 토큰 within AND).

## UI 힌트 (작은 개선)

텍스트 필터 Popover와 전역 검색창의 placeholder/툴팁에 콤마 사용 안내를 추가:

- 컬럼 텍스트 필터 입력 placeholder: `"Contains... (use , for AND)"`
- 전역 검색창 placeholder에 `"(comma = AND)"` 한 줄 추가 또는 옆에 작은 hint 텍스트.

## 비영향

- Pulldown(multi-select) 필터, 날짜 범위 필터, BulkEdit, Export, URL 필터 파라미터, faceted 옵션 카운트 — 모두 그대로.
- T&C(Subtest) Raw Data — 이번 범위 외.
- localStorage 저장 포맷 — 변경 없음(필터 값은 여전히 문자열).

## 결과

Defect Raw Data의 모든 텍스트 필터에서 `slab, rebar, B1` 같은 다중 키워드 검색이 가능해지며, 각 토큰이 모두 포함된 행만 표시됩니다.
