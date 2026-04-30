## 문제 (근본 원인)

**문제 A — Raw Data 필터가 드릴다운 시 초기화되지 않음**
현재 사용자가 Dashboard → Raw Data 로 URL 필터를 들고 이동할 때, 페이지는 localStorage 에 저장된 컬럼 필터와 URL 필터를 **병합**합니다. URL 이 명시적으로 덮어쓰는 컬럼 ID 만 제거됩니다. 결과적으로 이전 방문 시 걸어둔 필터가 살아남아 새 드릴다운 결과를 오염시킵니다 (예: "Team=X" 로 드릴인 했는데 예전 "Subcontractor=A" 필터가 그대로 남음).

사용자가 원하는 동작:
- Raw Data 에 **URL 필터/드릴다운 파라미터를 들고 진입**할 때 → **URL 로 넘어온 필터만** 적용, 나머지는 모두 초기화.
- Raw Data 에 **URL 필터 없이 진입**할 때 (사이드바 클릭 등) → 저장된 필터를 그대로 복원.

**문제 B — Dashboard 상태가 돌아올 때 초기화됨**
Dashboard 는 이미 그룹/탭/시스템 선택을 URL search params 에 인코딩하고 있고, 앱에는 라우트별 마지막 URL 을 저장하는 `useRouteMemory` 훅이 존재합니다. 하지만 `ROUTE_KEYS` 에는 **구 경로** (`/dashboard`, `/raw-data` 등) 만 등록되어 있고, 현재 사용 중인 `/tc/*` 와 `/defects/*` 경로가 빠져 있습니다. 결과:
- 사이드바 "Dashboard" 클릭 시 기억된 URL 이 무시됨 → 항상 파라미터 없는 `/tc/dashboard` 로 이동.
- 브라우저 뒤로가기는 작동하지만 사이드바 네비게이션은 작동하지 않음.

추가로: Dashboard 의 스크롤 위치는 저장되지 않아, 사이드바로 (또는 파라미터가 바뀐 채 뒤로가기로) 돌아오면 스크롤 위치가 맨 위로 리셋됩니다.

---

## 수정 계획

### 1. Raw Data — URL 필터를 들고 들어올 땐 저장된 필터 폐기

**파일:** `src/pages/SubtestList.tsx`, `src/pages/DefectRawDataPage.tsx`

상태 로딩 `useEffect` 의 병합 로직 변경:

- "드릴다운 진입" 감지: 알려진 URL 필터 파라미터 중 하나라도 존재하면 드릴다운으로 판정 (DefectRawDataPage 는 이미 `DRILLDOWN_PARAMS` 보유, SubtestList 는 `urlMap` + 날짜/상태 URL 파라미터 기반으로 동일 개념 추가).
- 드릴다운 감지 시 → **저장된 `columnFilters` 를 완전히 폐기**, URL 에서 파생된 필터만 적용. `globalFilter` 도 URL 에 `q` 가 없으면 비움.
- 드릴다운이 아니면 → 기존대로 저장된 필터 복원.

정렬과 컬럼 너비 동작은 그대로 유지 (너비는 항상 복원, 정렬은 클린 진입일 때만 복원 — DefectRawDataPage 는 이미 구현됨, SubtestList 에도 동일하게 적용해 일관성 확보).

### 2. 사이드바 라우트 메모리 — 현재 `/tc/*` 와 `/defects/*` 경로 추가

**파일:** `src/hooks/useRouteMemory.ts`

`getRememberedRoute()` 가 search params 까지 포함된 마지막 방문 URL 을 반환하도록 신규 라우트 키 추가:

```
/tc/dashboard, /tc/progress, /tc/schedule-revision, /tc/raw-data,
/tc/import, /tc/import/logs, /tc/export, /tc/quick-update,
/defects/dashboard, /defects/progress, /defects/schedule-revision,
/defects/raw-data, /defects/import, /defects/import/logs,
/defects/export, /defects/quick-update
```

`/tc/import/logs` 가 `/tc/import` 에 가려지지 않도록 가장 긴 매치 우선 순서 유지.

결과: 사이드바에서 Dashboard 클릭 시 마지막에 보던 탭/그룹/필터 상태로 정확히 복귀.

### 3. Dashboard 스크롤 위치 보존

**파일:** `src/pages/DashboardPage.tsx`, `src/pages/DefectDashboardPage.tsx`

두 Dashboard 모두 `AppLayout` 의 `<main>` 안에서 렌더링됨 (스크롤 컨테이너). 각 Dashboard 에 작은 effect 추가:

- 언마운트 / 라우트 변경 시 → 라우트별 키 (예: `dashboard-scroll:/tc/dashboard`) 로 `main.scrollTop` 을 `sessionStorage` 에 저장.
- 마운트 시 로딩 완료 후 → `sessionStorage` 에서 `main.scrollTop` 복원 (1회성).

`sessionStorage` 사용 (localStorage 아님) → 새 브라우저 세션에서는 리셋되지만 앱 내 네비게이션에서는 유지됨.

---

## 수정 후 동작 요약

| 시나리오 | 수정 전 | 수정 후 |
|---|---|---|
| Dashboard 카드 → Raw Data (URL 필터 포함) | 저장된 옛 필터가 병합됨 | URL 필터만 적용 |
| 사이드바 → Raw Data (URL 필터 없음) | 저장된 필터 복원 | 저장된 필터 복원 (변경 없음) |
| Raw Data → 사이드바 Dashboard | 기본 Dashboard 로 이동, 탭/그룹 리셋 | 마지막 탭/그룹/필터 그대로 복귀 |
| Dashboard → Raw Data → 사이드바 Dashboard | 스크롤 맨 위, 필터 리셋 | 스크롤 복원, 필터 보존 |

---

## 기술 메모

- SubtestList 드릴다운 감지 시 파라미터 집합은 `urlMap` 키 + `status`, `scope`, `at_risk_days`, 컴포넌트가 이미 읽고 있는 모든 `*_planned_to/_on/_actual_*/_delay_*` 파라미터, 그리고 `q` 로 구성.
- `useRouteMemory` 의 저장은 `pathname + search` 변경마다 일어나므로, 키만 추가하면 모든 사이드바 항목에 즉시 영속화 적용됨.
- 스크롤 복원은 `loading === false` 를 기다리고 마운트당 1회만 실행 (`useRef` 플래그 사용) — 재렌더로 덮어쓰이지 않게.
- 백엔드/마이그레이션 변경 없음.

**수정 파일:** `src/pages/SubtestList.tsx`, `src/pages/DefectRawDataPage.tsx`, `src/hooks/useRouteMemory.ts`, `src/pages/DashboardPage.tsx`, `src/pages/DefectDashboardPage.tsx`.
