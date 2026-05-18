## 목표

대시보드 화면 상단에 **자동 새로고침 토글**을 추가하여, 사용자가 켜두면 설정한 주기마다 **데이터만 다시 불러와서**(soft refresh) 최신 현황을 자동으로 반영합니다. 페이지 전체 리로드가 아니므로 스크롤/필터/입력 상태가 보존됩니다.

---

## 사전 답변

**Q. 대시보드만 리로드해도 실시간 raw data 값을 가져오나요?**
네. 현재 대시보드는 페이지 진입 시 `supabase.from('subtests')` 등으로 Supabase에서 직접 데이터를 페치합니다. 별도 캐시 레이어가 없기 때문에, **동일한 로드 함수를 다시 호출**하면 그 시점의 최신 raw data 가 그대로 반영됩니다. (사용자가 Raw Data 페이지에서 수정/저장한 값도 즉시 반영됨)

---

## 적용 대상 화면

1. `src/pages/DashboardPage.tsx` — T&C Dashboard
2. `src/pages/DefectDashboardPage.tsx` — Defect Dashboard
3. `src/pages/docs/DocsDashboardPage.tsx` — Docs Dashboard
4. `src/pages/PunchDashboardPage.tsx` — Punch Dashboard (존재 시 동일 패턴)

---

## UI

각 Dashboard 페이지 **상단 헤더 영역 우측**에 컴팩트한 자동 새로고침 컨트롤 1세트를 배치합니다:

```text
[ Auto-refresh ⏻ ]  [ 30s ▾ ]   Last updated: 14:23:05
```

- **토글 스위치**: Auto-refresh on/off (Switch 컴포넌트)
- **주기 드롭다운**: 15s / 30s / 1m / 2m / 5m / 10m (Select 컴포넌트)
- **Last updated**: 마지막 페치 성공 시각 (HH:mm:ss)
- 토글이 off 일 때는 주기 드롭다운 비활성화
- 페치가 진행 중일 땐 작은 스피너 아이콘 표시

---

## 동작

1. 토글 on → `setInterval` 로 주기마다 기존 데이터 로드 함수(`load()`) 호출 → state 만 갱신, 페이지 리로드 없음
2. 토글 off → interval 해제
3. 페이지를 벗어나면 cleanup
4. **탭이 백그라운드**일 때는 페치 일시중단 (`document.visibilityState`), 다시 보이면 즉시 1회 페치 후 주기 재개
5. 페치 중 사용자가 필터/스크롤을 바꿔도 영향 없음 (state 갱신만, 스크롤 복원은 기존 `useMainScrollRestoration` 에 의존하지 않고 그대로 두면 됨 — 초기 로드 플래그만 사용하므로)

---

## 설정 저장 (사용자별)

브라우저 단위로 사용자마다 다르게:

- `localStorage` 키:
  - `dashboard.autoRefresh.enabled` ("1" | "0")
  - `dashboard.autoRefresh.intervalMs` (number)
- 각 대시보드(T&C / Defect / Docs / Punch)별로 별도 키 사용:
  - `dashboard.autoRefresh.tnc.enabled` 등 prefix 분리
- 기본값: **off, 30초**

서버 저장(`profiles` 테이블) 은 하지 않습니다. 디바이스마다 다른 환경(공용 PC, 개인 PC)에서 동작이 달라야 하므로 localStorage 가 더 자연스럽습니다. 추후 필요하면 확장 가능.

---

## 신규/수정 파일

**신규**
- `src/hooks/useAutoRefresh.ts`
  - 인자: `{ storageKey: string; defaultIntervalMs?: number; onRefresh: () => Promise<void> | void; }`
  - 반환: `{ enabled, setEnabled, intervalMs, setIntervalMs, lastUpdatedAt, isRefreshing, refreshNow }`
  - 내부: localStorage I/O, setInterval 관리, visibility 처리
- `src/components/dashboard/AutoRefreshControl.tsx`
  - 위 훅의 반환값을 prop 으로 받아 Switch + Select + "Last updated" 표기

**수정**
- `src/pages/DashboardPage.tsx` — `load()` 를 `useCallback` 으로 빼고 `useAutoRefresh` 연결, 헤더에 `<AutoRefreshControl />` 배치
- `src/pages/DefectDashboardPage.tsx` — 동일
- `src/pages/docs/DocsDashboardPage.tsx` — 동일 (`loadDashboardData` 호출부)
- `src/pages/PunchDashboardPage.tsx` — 동일 (해당 페이지가 있을 경우)

---

## 기술 세부

- 자동 새로고침 시에는 `setLoading(true)` 를 **호출하지 않음**. 대신 `isRefreshing` 만 표시 → 화면 깜빡임 방지.
- 첫 진입은 기존 로직 그대로 (`loading` 스피너).
- `onRefresh` 가 던지는 에러는 toast 로 1회만 표시하고 다음 주기 계속 시도.
- Import/Defect Import 진행 중일 때도 자동 새로고침은 그대로 동작 (서로 독립적).
- 코드 변경은 프론트엔드/표시 레이어에 한정 — 데이터 페치 로직, 비즈니스 규칙, RLS, DB 스키마 변경 없음.

---

## 비범위 (이번에는 안 함)

- 페이지 전체 hard reload, 비활성 상태 감지 후 리로드
- Realtime 구독(Supabase channels) — 후속 단계에서 검토 가능
- 다른 페이지(Progress, Raw Data, Schedule 등)로 확장 — 이번에는 Dashboard 만
- 서버 저장형 사용자 환경설정
