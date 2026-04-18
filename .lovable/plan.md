

## SubtestList 성능 최적화 — Long Engagement Time 단축

### 사용자 메시지 해석
"#Low Eng" = **Long Engagement** (페이지를 사용 중일 때 매 동작마다 시간이 오래 걸리고 랙) 의미로 해석. 레코드가 많아질수록 매 키 입력/필터/정렬마다 전체 행을 다시 렌더링해서 발생하는 문제.

### 현재 병목 지점 (코드 분석 결과)

1. **모든 행을 한 번에 DOM 렌더링** — `table.getRowModel().rows.map(...)`로 5,000~20,000행 전부 `<TableRow>` 생성. 가장 큰 원인.
2. **검색어 입력 시 매 키스트로크마다 전체 재필터링 + 재렌더** — `globalFilter` debounce 없음.
3. **컬럼 리사이즈 중 (`columnResizeMode: 'onChange'`)** — 드래그 중 매 픽셀마다 모든 행 재렌더.
4. **sticky 스타일 계산이 인라인 IIFE 안에서 매 렌더마다 재실행** — `getStickyStyle`이 셀 수 × 매 렌더 호출.
5. **컬럼 사이징 localStorage 저장이 리사이즈 드래그 중에도 매번 발생** (debounce 없음).
6. **`fetchData()` 가 페이지 진입마다 무조건 1,000건씩 페이징해 전체 로드** — 첫 진입 비용 큼.

### 최적화 방안 (낮은 위험 → 높은 효과 순)

**A. 가상 스크롤 (Row Virtualization) — 가장 큰 효과**
- `@tanstack/react-virtual` 도입 (React 18 호환, 이미 `@tanstack/react-table`과 같은 생태계).
- 화면에 보이는 ~30행만 DOM 렌더 → 5,000행이든 50,000행이든 렌더 비용 일정.
- sticky 헤더/sticky 컬럼 모두 호환됨 (TableBody만 가상화, TableHeader 그대로 둠).

**B. 검색어 debounce (300ms)**
- `globalFilter` 입력값을 별도 state로 받아 300ms 후 react-table에 반영.
- 타이핑 중 재필터/재렌더 멈춤.

**C. 컬럼 리사이즈 모드 변경**
- `columnResizeMode: 'onChange'` → `'onEnd'`. 드래그 중 행 재렌더 0회, 마우스 놓을 때 1회만.
- 시각적 미리보기는 react-table이 헤더 라인으로 처리.

**D. columnSizing localStorage 저장 debounce (500ms)**
- 리사이즈 종료 후에만 저장 → JSON.stringify 부담 감소.

**E. sticky 헬퍼 메모화**
- IIFE 안의 `stickyOffsets`, `getStickyStyle`, `isLastSticky`를 `useMemo`로 빼서 불필요한 재계산 제거.
- `leafCols` 의존성: `columnVisibility + columnOrder + columnSizing` 변경 시에만 재계산.

**F. 데이터 fetch 캐싱 + 백그라운드 새로고침 (선택)**
- 사용자가 메시지에서 언급한 "세이브 후/일정 조건에서만 재계산":
  - 진입 시 메모리 캐시 (`window` 모듈 변수 또는 React Query 도입) 표시 → 즉시 렌더.
  - 백그라운드에서 fresh 데이터 fetch → 완료 시 갱신.
  - 상세 페이지에서 저장 후 돌아올 때만 강제 새로고침 (`location.state.refresh = true` 또는 캐시 무효화).
- **간단한 구현**: 모듈 스코프 변수 (`let cache: SubtestRow[] | null = null`)에 마지막 fetch 결과 저장, `fetchData` 진입 시 캐시 즉시 표시 + 백그라운드 갱신. React Query 추가 없이 가능.

**G. 셀 컴포넌트 메모화 (선택, 효과는 작음)**
- 가상화 적용 후엔 거의 불필요. 일단 보류.

### 변경 파일

| 파일 | 변경 |
|---|---|
| `package.json` | `@tanstack/react-virtual` 추가 |
| `src/pages/SubtestList.tsx` | (1) `useVirtualizer`로 TableBody 가상화, (2) globalFilter debounce, (3) `columnResizeMode: 'onEnd'`, (4) columnSizing 저장 debounce, (5) sticky 헬퍼 useMemo, (6) 모듈 스코프 캐시로 즉시 표시 + 백그라운드 갱신 |
| `src/pages/SubtestDetail.tsx` | 저장 후 캐시 무효화 트리거 (export된 invalidate 함수 호출) |

### 예상 결과
- 첫 진입: 캐시가 있으면 **즉시** 표시 (0ms), 없으면 기존과 동일.
- 검색/필터/정렬 변경: 화면 30행만 다시 그리므로 5,000행 → **수십 ms 이내** (현재는 수백~수천 ms).
- 컬럼 리사이즈: 드래그 중 완전 부드러움 (행 재렌더 없음).
- 가로 스크롤/세로 스크롤: 가상화로 항상 일정한 fps.

### 위험 / 주의
- 가상화 적용 시 `<table>` 구조가 약간 바뀜 (TableBody 내부에 spacer 행 + 절대 위치 행). 기존 sticky 컬럼/헤더 동작 유지하도록 careful integration 필요.
- 캐시 도입 시 다른 사용자가 데이터 수정한 경우 stale 가능 → 백그라운드 새로고침으로 즉시 갱신.

DB / RLS / Import / Export 로직 변경 없음.

